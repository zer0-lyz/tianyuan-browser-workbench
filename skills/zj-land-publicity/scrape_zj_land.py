"""抓取浙江自然资源土地成交公示（通用版，支持任意行政区）"""
import requests
import re
import openpyxl
from openpyxl.styles import Font, Alignment
from openpyxl.utils import get_column_letter
import time
import os
import json
import argparse
from pathlib import Path
from urllib.parse import urlencode

# ============================================================
#  坐标提取相关（可选，依赖 PyMuPDF + 图像模型）
# ============================================================
try:
    import fitz  # PyMuPDF
    PYMUPDF_AVAILABLE = True
except ImportError:
    PYMUPDF_AVAILABLE = False


def fetch_attachment_list(source_id):
    """获取地块的附件列表（出让公告、宗地界址图等）

    Args:
        source_id: 地块资源ID（即 sourceId）

    Returns:
        list: 附件记录列表，每条含 fileName, fileId, fileType, url 等
    """
    url = (
        f"https://www.zjzrzyjy.com/trade/view/landbidding/queryLandResourceUploadFile"
        f"?resourceId={source_id}&fileType=XZWJ&currentPage=1&pageSize=200"
    )
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": f"https://www.zjzrzyjy.com/landView/land-bidding/source-detail?resourceId={source_id}"
    }
    try:
        resp = requests.get(url, headers=headers, timeout=20)
        data = resp.json()
        records = data.get('data', {}).get('records', [])
        result = []
        for r in records:
            # 优先从 fileContent JSON 中取 url
            file_content_str = r.get('fileContent', '')
            if file_content_str:
                try:
                    fc = json.loads(file_content_str)
                    if isinstance(fc, list) and fc:
                        first = fc[0]
                        file_url = first.get('url', '')
                        if file_url:
                            result.append({
                                'fileName': r.get('fileName', ''),
                                'fileId': first.get('id', '') or r.get('fileId', ''),
                                'dataType': r.get('dataType', ''),
                                'url': file_url,
                            })
                            continue
                except (json.JSONDecodeError, IndexError):
                    pass
            # 兜底：从 r 直接取
            result.append({
                'fileName': r.get('fileName', ''),
                'fileId': r.get('fileId', ''),
                'dataType': r.get('dataType', ''),
                'url': r.get('url', ''),
            })
        return result
    except Exception as e:
        print(f"  [附件] 请求失败: {e}")
        return []


def download_pdf(url, output_path, timeout=30):
    """下载 PDF 文件"""
    try:
        resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=timeout)
        if resp.status_code == 200 and len(resp.content) > 1000:
            with open(output_path, 'wb') as f:
                f.write(resp.content)
            return True
    except Exception:
        pass
    return False


def extract_coordinates_from_pdf(pdf_path):
    """从勘测定界图 PDF 中提取地块边界坐标

    原理：PDF 为矢量/图像混合，先用 PyMuPDF 渲染为图像，
          再通过图像模型识别 X/Y 坐标值。

    Args:
        pdf_path: PDF 文件本地路径

    Returns:
        dict: {
            'status': 'ok'|'error'|'no_coord',
            'coords': [(x, y), ...]  # CGCS2000 坐标系坐标列表
            'area': float  # 公顷
            'scale': str   # 比例尺
            'note': str    # 说明
        }
    """
    if not PYMUPDF_AVAILABLE:
        return {'status': 'error', 'note': 'PyMuPDF 未安装'}

    if not os.path.exists(pdf_path):
        return {'status': 'error', 'note': 'PDF 文件不存在'}

    try:
        doc = fitz.open(pdf_path)
        page = doc[0]

        # 渲染为高分辨率图像
        mat = fitz.Matrix(3, 3)  # 3x 缩放，提高文字清晰度
        pix = page.get_pixmap(matrix=mat)
        img_bytes = pix.tobytes("png")
        img_path = pdf_path + ".png"
        with open(img_path, 'wb') as f:
            f.write(img_bytes)

        doc.close()
        return {
            'status': 'ok',
            'note': f'已渲染为图像: {img_path}，请调用图像模型提取坐标',
            'rendered_image': img_path,
            'pixel_size': f'{pix.width}x{pix.height}',
        }
    except Exception as e:
        return {'status': 'error', 'note': str(e)}


def fetch_resource_detail(source_id):
    """获取地块详情接口数据，包含 resourceCoordinate 等字段"""
    url = f"https://www.zjzrzyjy.com/trade/view/landbidding/queryResourceDetail?resourceId={source_id}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": f"https://www.zjzrzyjy.com/landView/land-bidding/source-detail?resourceId={source_id}"
    }
    for attempt in range(1, 4):
        try:
            resp = requests.get(url, headers=headers, timeout=30)
            resp.raise_for_status()
            return resp.json().get('data', {}) or {}
        except Exception as e:
            if attempt == 3:
                print(f"  [详情] 请求失败: {e}")
                return {}
            time.sleep(0.5)


def normalize_resource_coordinate(raw):
    """把 resourceCoordinate 规范化为 dict。"""
    if not raw:
        return {}
    if isinstance(raw, dict):
        coord = raw
    else:
        try:
            coord = json.loads(raw)
        except Exception:
            return {}
    if not isinstance(coord, dict):
        return {}

    center = coord.get('center') or {}
    point_groups = coord.get('pointGroups') or []
    point_count = 0
    for group in point_groups:
        point_count += len(group.get('points') or [])
    coord['point_count'] = point_count
    coord['group_count'] = len(point_groups)
    coord['center'] = center
    coord['pointGroups'] = point_groups
    return coord


def build_map_assets(rows, output_path):
    """按 resourceCoordinate 生成 JSON / JS / HTML 地图文件。"""
    base = Path(output_path)
    stem = base.with_suffix('')
    coord_json = stem.as_posix() + "_coords.json"
    points_js = stem.as_posix() + "_points.js"
    map_html = stem.as_posix() + "_map.html"

    points = []
    for r in rows:
        coord = r.get('_coord', {})
        center = coord.get('center') or {}
        lng = center.get('lng')
        lat = center.get('lat')
        if lng in (None, '') or lat in (None, ''):
            continue
        points.append({
            'name': r.get('sourceCode', ''),
            'district': r.get('districtName', ''),
            'date': r.get('releaseTime', ''),
            'url': r.get('_detail_url', ''),
            'location': r.get('_location', ''),
            'center': [lng, lat],
            'origin': [center.get('originLng', ''), center.get('originLat', '')],
            'area_mu': r.get('_area_mu', ''),
            'use': r.get('_use', ''),
            'startUnitPriceYuanSqm': r.get('_start_unit_price', ''),
            'startTotalPriceWan': r.get('_start_total_price_wan', ''),
            'dealUnitPriceYuanSqm': r.get('_deal_unit_price', ''),
            'dealTotalPriceWan': r.get('_deal_total_price_wan', ''),
            'assignmentAreaSqm': r.get('_assignment_area_sqm', ''),
            'pointCount': coord.get('point_count', 0),
            'groupCount': coord.get('group_count', 0),
        })

    with open(coord_json, 'w', encoding='utf-8') as f:
        json.dump(points, f, ensure_ascii=False, indent=2)

    with open(points_js, 'w', encoding='utf-8') as f:
        f.write("window.ZJ_LAND_POINTS = ")
        json.dump(points, f, ensure_ascii=False, separators=(',', ':'))
        f.write(";\n")

    html = f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>浙江土地成交坐标地图</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css" />
  <style>
    html, body {{ height: 100%; margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
    #map {{ height: 100%; width: 100%; }}
    .panel {{
      position: absolute; z-index: 1000; top: 12px; left: 12px; background: rgba(255,255,255,.95);
      padding: 12px 14px; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,.15);
      max-width: 360px; line-height: 1.5;
    }}
    .panel h1 {{ margin: 0 0 6px; font-size: 16px; }}
    .panel .sub {{ color: #555; font-size: 12px; }}
    .popup-title {{ font-weight: 700; margin-bottom: 6px; }}
    .popup-meta {{ font-size: 12px; color: #444; line-height: 1.4; }}
    a {{ color: #0a58ca; text-decoration: none; }}
  </style>
</head>
<body>
  <div class="panel">
    <h1>浙江土地成交坐标地图</h1>
    <div class="sub">共 {len(points)} 宗可定位地块。</div>
    <div class="sub">标注点为 `resourceCoordinate.center`。</div>
  </div>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
  <script src="./{Path(points_js).name}"></script>
  <script>
    const map = L.map('map', {{ preferCanvas: true }}).setView([29.2, 120.2], 8);
    L.tileLayer('https://{{s}}.tile.openstreetmap.org/{{z}}/{{x}}/{{y}}.png', {{
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }}).addTo(map);

    const cluster = L.markerClusterGroup({{ disableClusteringAtZoom: 16 }});
    const bounds = [];

    function esc(s) {{
      return String(s ?? '').replace(/[&<>"']/g, m => ({{'&':'&amp;','<':'&lt;','>':'&gt;','\\"':'&quot;',"'":'&#39;'}}[m]));
    }}

    for (const p of window.ZJ_LAND_POINTS || []) {{
      const latlng = [Number(p.center[1]), Number(p.center[0])];
      if (!Number.isFinite(latlng[0]) || !Number.isFinite(latlng[1])) continue;
      bounds.push(latlng);
      const marker = L.marker(latlng);
      marker.bindPopup(`
        <div class="popup-title">${{esc(p.name)}}</div>
        <div class="popup-meta">
          行政区：${{esc(p.district)}}<br/>
          发布时间：${{esc(p.date)}}<br/>
          地块位置：${{esc(p.location)}}<br/>
          坐标中心：${{esc(p.center[0])}}, ${{esc(p.center[1])}}<br/>
          原始坐标：${{esc(p.origin[0])}}, ${{esc(p.origin[1])}}<br/>
          用地信息：${{esc(p.use)}}<br/>
          出让面积：${{esc(p.area_mu)}} 亩<br/>
          起始单价：${{esc(p.startUnitPriceYuanSqm)}} 元/平方米<br/>
          起始总价：${{esc(p.startTotalPriceWan)}} 万元<br/>
          成交单价：${{esc(p.dealUnitPriceYuanSqm)}} 元/平方米<br/>
          成交总价：${{esc(p.dealTotalPriceWan)}} 万元<br/>
          边界点：${{esc(p.pointCount)}} 个，分 ${{esc(p.groupCount)}} 组<br/>
          <a href="${{esc(p.url)}}" target="_blank" rel="noreferrer">打开详情页</a>
        </div>
      `);
      cluster.addLayer(marker);
    }}

    map.addLayer(cluster);
    if (bounds.length) {{
      map.fitBounds(bounds, {{ padding: [30, 30] }});
    }}
  </script>
</body>
</html>
"""
    with open(map_html, 'w', encoding='utf-8') as f:
        f.write(html)

    return {
        'coord_json': coord_json,
        'points_js': points_js,
        'map_html': map_html,
        'point_count': len(points),
    }


# ============================================================
#  核心抓取逻辑
# ============================================================

def clean_text(text):
    if not text:
        return ''
    text = re.sub(r'&nbsp;', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def parse_content_fields(content):
    """用td标签解析土地详情"""
    result = {
        '宗地编号': '',
        '地块位置': '',
        '土地用途': '',
        '土地面积(亩)': '',
        '出让年限': '',
        '成交结果': '',
        '受让单位': '',
    }

    tds = re.findall(r'<td[^>]*>(.*?)</td>', content, re.DOTALL)
    if not tds:
        return result

    cells = []
    for td in tds:
        text = re.sub(r'<[^>]+>', '', td)
        text = clean_text(text)
        cells.append(text)

    label_keywords = [
        ('宗地编号', '宗地编号'),
        ('地块位置', '地块位置'),
        ('土地用途', '土地用途'),
        ('土地面积', '土地面积(亩)'),
        ('出让年限', '出让年限'),
        ('成交结果', '成交结果'),
        ('成交价', '成交结果'),
        ('受让单位', '受让单位'),
        ('受让人', '受让单位'),
    ]

    for i, cell in enumerate(cells):
        if not cell or cell in ['明细用途', '用途名称', '面积（亩）']:
            continue
        for kw, field_name in label_keywords:
            if kw in cell and not result[field_name]:
                if field_name == '土地面积(亩)':
                    val = cells[i+1] if i+1 < len(cells) else ''
                    m = re.search(r'(\d+\.?\d*)', val)
                    result[field_name] = m.group(1) if m else val
                elif field_name == '出让年限':
                    val = cells[i+1] if i+1 < len(cells) else ''
                    m = re.search(r'(\d+)\s*年', val)
                    result[field_name] = m.group(1) + '年' if m else val
                else:
                    result[field_name] = cells[i+1] if i+1 < len(cells) else ''
                break

    return result


def extract_number(text):
    """从文本中提取首个数值，提取不到返回 None。"""
    if text is None:
        return None
    m = re.search(r'(\d+\.?\d*)', str(text))
    return float(m.group(1)) if m else None


def calc_total_price_wan(unit_price_yuan_sqm, area_mu=None, area_sqm=None):
    """按单价(元/㎡)和面积计算总价(万元)。"""
    unit = extract_number(unit_price_yuan_sqm)
    if unit is None:
        return ''

    sqm = extract_number(area_sqm)
    if sqm is None and area_mu is not None:
        mu = extract_number(area_mu)
        if mu is not None:
            sqm = mu * 666.67

    if sqm is None:
        return ''

    return round(unit * sqm / 10000, 2)


def _release_date_key(value):
    text = str(value or "")
    match = re.search(r"(\d{4})\D*(\d{1,2})\D*(\d{1,2})", text)
    if not match:
        return None
    try:
        return tuple(int(part) for part in match.groups())
    except ValueError:
        return None


def _region_text(value):
    return re.sub(r"[\s（）()]", "", str(value or "")).casefold()


def _collect_region_codes(node):
    codes = []
    code = str(node.get("districtCode") or "").strip()
    if code:
        codes.append(code)
    for child in node.get("children") or []:
        codes.extend(_collect_region_codes(child))
    return codes


def fetch_region_codes(region_name):
    """读取官网行政区树，返回列表接口可接受的区域代码集合。"""
    if not region_name:
        return []
    urls = (
        "https://www.zjzrzyjy.com/trade/uniportal/index/districtList",
        "https://www.zjzrzyjy.com/trade/view/preApply/preAnnouncement/districtList",
    )
    wanted = _region_text(region_name)
    for url in urls:
        try:
            response = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=20)
            data = response.json()
        except Exception:
            continue
        roots = data.get("data") or []
        queue = list(roots)
        while queue:
            node = queue.pop(0)
            if _region_text(node.get("districtName")) == wanted:
                return list(dict.fromkeys(_collect_region_codes(node)))
            queue.extend(node.get("children") or [])
    return []


def _land_bidding_json_list(value):
    """解析 land-bidding 接口中的 JSON 数组字段。"""
    if isinstance(value, list):
        return value
    if not value:
        return []
    try:
        parsed = json.loads(value) if isinstance(value, str) else value
    except (TypeError, json.JSONDecodeError):
        return []
    return parsed if isinstance(parsed, list) else []


def _land_bidding_use_names(record):
    names = []
    for item in _land_bidding_json_list(record.get("planUse")):
        if not isinstance(item, dict):
            continue
        name = str(item.get("NAME_") or item.get("name") or "").strip()
        if name and name not in names:
            names.append(name)
    for value in (record.get("primaryLandUse"), record.get("landUse")):
        name = str(value or "").strip()
        if name and name not in names:
            names.append(name)
    return "、".join(names)


def _land_bidding_transaction_label(record):
    mode = str(record.get("transactionMode") or record.get("tradeMode") or "").upper()
    transaction_type = str(record.get("transactionType") or "").upper()
    is_lease = transaction_type in {"ZL", "LEASE", "RENT"} or "租" in str(record.get("resourceNumber") or "")
    if mode == "GP":
        return "挂牌租赁" if is_lease else "挂牌出让"
    if mode == "PM":
        return "拍卖租赁" if is_lease else "拍卖出让"
    return str(record.get("tradeType") or record.get("transactionMode") or "").strip()


def normalize_land_bidding_record(record):
    """将 land-bidding 列表记录转换为运行器使用的统一字段。"""
    normalized = dict(record or {})
    resource_number = str(record.get("resourceNumber") or record.get("sourceCode") or "").strip()
    release_time = (
        record.get("ggPubTime")
        or record.get("pubTime")
        or record.get("announcementPubTime")
        or record.get("releaseTime")
        or ""
    )
    resource_stage = str(record.get("resourceStage") or record.get("tradeStage") or "").strip().upper()
    normalized.update({
        "publicityId": record.get("publicityId") or resource_number,
        "sourceId": record.get("resourceId") or record.get("sourceId") or "",
        "sourceCode": resource_number,
        "districtName": record.get("xzqName") or record.get("districtName") or "",
        "districtCode": record.get("regionCode") or record.get("districtCode") or "",
        "releaseTime": release_time,
        # The website filters this list by enrollment/listing start time. Keep
        # it separately from ggPubTime, which is the date shown in the result.
        "_queryDate": record.get("enrollStartTime") or record.get("listingStartTime") or release_time,
        "quoteStartTime": record.get("listingStartTime") or record.get("enrollStartTime") or record.get("quoteStartTime") or "",
        "content": record.get("content") or "",
        "landUse": _land_bidding_use_names(record),
        "assignmentPurpose": _land_bidding_use_names(record),
        "tradeType": _land_bidding_transaction_label(record),
        "tradeStage": "结果公示" if resource_stage == "CJ" else (record.get("tradeStage") or resource_stage),
        "tradeForm": record.get("tradeForm") or ("国有土地" if record.get("resourceCategory") == "TD" else ""),
        "_sourceEndpoint": "landbidding",
    })
    return normalized


def fetch_land_bidding_records(
    district_filter=None,
    max_pages=200,
    record_filter=None,
    stop_before=None,
    server_filters=None,
):
    """读取官网 land-bidding 页面实际使用的成交结果列表接口。

    该接口与旧的 queryPublicityList 字段和分页参数不同，必须使用
    currentPage/pageSize、enrollStartTime/nowTime 和 resourceStage=CJ。
    返回值已归一化为旧运行器兼容的字段名。
    """
    all_records = []
    page = 1
    page_size = 50
    stop_key = _release_date_key(stop_before)
    query_filters = dict(server_filters or {})
    region_name = query_filters.pop("regionName", "")
    fallback_region_name = query_filters.pop("fallbackRegionName", "")
    if region_name and not query_filters.get("regionCode"):
        region_codes = fetch_region_codes(region_name)
        if not region_codes and fallback_region_name:
            region_codes = fetch_region_codes(fallback_region_name)
        if not region_codes:
            raise RuntimeError("LAND_REGION_FILTER_RESOLUTION_FAILED")
        query_filters["regionCode"] = ",".join(region_codes)

    while page <= max_pages:
        params = {
            "currentPage": page,
            "pageSize": page_size,
            "resourceStage": "CJ",
        }
        params.update({key: value for key, value in query_filters.items() if value not in (None, "")})
        url = (
            "https://www.zjzrzyjy.com/trade/view/landbidding/querylandbidding?"
            + urlencode(params)
        )
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.zjzrzyjy.com/landView/land-bidding",
        }
        try:
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            payload = response.json()
            data = payload.get("data") or {}
            records = data.get("records") or []
        except Exception as error:
            print(f"成交列表第{page}页请求失败: {error}")
            break
        if not records:
            break

        normalized_records = [normalize_land_bidding_record(record) for record in records]
        for record in normalized_records:
            district = str(record.get("districtName") or "")
            district_code = str(record.get("districtCode") or "")
            matched = True
            if district_filter:
                name_kw = str(district_filter.get("name") or "")
                code_kw = str(district_filter.get("code") or "")
                exact = bool(district_filter.get("exact", False))
                if exact:
                    matched = (bool(name_kw) and name_kw == district) or (bool(code_kw) and code_kw == district_code)
                else:
                    matched = (bool(name_kw) and name_kw in district) or (bool(code_kw) and code_kw in district_code)
            if matched and (record_filter is None or record_filter(record)):
                all_records.append(record)

        print(f"成交列表第{page}页: {len(records)}条, 累计{len(all_records)}条")
        last_key = _release_date_key(normalized_records[-1].get("_queryDate") or normalized_records[-1].get("releaseTime"))
        if stop_key and last_key and last_key < stop_key:
            break
        try:
            total = int(data.get("total") or 0)
        except (TypeError, ValueError):
            total = 0
        if len(records) < page_size or (total and page * page_size >= total):
            break
        page += 1
        time.sleep(0.3)

    return all_records


def fetch_records(district_filter=None, max_pages=200, record_filter=None, stop_before=None, server_filters=None):
    """分页读取成交公示列表，并在详情请求前执行可证明安全的候选过滤。

    Args:
        district_filter: dict，键为 'name' 或 'code'，值为匹配字符串
            例如: {'name': '兰溪'} 或 {'code': '330781'}
        max_pages: 最大页数
        record_filter: 可选的列表记录过滤函数；未知字段应返回 True，交由详情阶段复核
        stop_before: 可选日期字符串；列表按发布时间倒序且当前页最末记录早于该日期时停止翻页
        server_filters: 网站列表接口支持的业务筛选参数
    """
    all_records = []
    page = 1
    # The endpoint supports region/date filters; keep a large page size for the
    # remaining local checks without turning them into unverified query params.
    page_size = 500
    stop_key = _release_date_key(stop_before)
    query_filters = dict(server_filters or {})
    region_name = query_filters.pop("regionName", "")
    fallback_region_name = query_filters.pop("fallbackRegionName", "")
    if region_name and not query_filters.get("regionCode"):
        region_codes = fetch_region_codes(region_name)
        if not region_codes and fallback_region_name:
            region_codes = fetch_region_codes(fallback_region_name)
        if not region_codes:
            raise RuntimeError("LAND_REGION_FILTER_RESOLUTION_FAILED")
        query_filters["regionCode"] = ",".join(region_codes)

    while page <= max_pages:
        params = {"type": 3, "current": page, "size": page_size, "sort": "desc"}
        if query_filters:
            params.update({key: value for key, value in query_filters.items() if value not in (None, "")})
        url = ("https://www.zjzrzyjy.com/trade/view/publicity/queryPublicityList?"
               + urlencode(params))
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.zjzrzyjy.com/landWeb/publicityList"
        }
        try:
            resp = requests.get(url, headers=headers, timeout=30)
            data = resp.json()
        except Exception as e:
            print(f"第{page}页请求失败: {e}")
            break

        records = data.get('data', {}).get('records', [])
        if not records:
            break

        for r in records:
            district = str(r.get('districtName', ''))
            district_code = str(r.get('districtCode', ''))
            matched = True
            if district_filter:
                name_kw = district_filter.get('name', '')
                code_kw = district_filter.get('code', '')
                exact = bool(district_filter.get('exact', False))
                if exact:
                    matched = (bool(name_kw) and name_kw == district) or (bool(code_kw) and code_kw == district_code)
                else:
                    matched = (bool(name_kw) and name_kw in district) or (bool(code_kw) and code_kw in district_code)
            if matched and (record_filter is None or record_filter(r)):
                all_records.append(r)

        print(f"第{page}页: {len(records)}条, 累计{len(all_records)}条")
        last_key = _release_date_key(records[-1].get("releaseTime"))
        if stop_key and last_key and last_key < stop_key:
            break
        page += 1
        time.sleep(0.3)

    return all_records


def fetch_and_render_coordinates(source_id, temp_dir='/tmp'):
    """获取地块的勘测定界图 PDF 并渲染为图像

    Args:
        source_id: 地块 resourceId
        temp_dir: 临时目录

    Returns:
        dict: {
            'pdf_path': str,   # PDF 本地路径（下载后）
            'rendered_image': str,  # 渲染图路径
            'file_id': str,    # 文件 ID
            'file_name': str,  # 原文件名
            'status': str,     # 'ok' | 'no_pdf' | 'download_failed'
        }
    """
    attachments = fetch_attachment_list(source_id)

    # 找宗地界址图
    map_file = None
    for att in attachments:
        dt = att.get('dataType', '')
        fname = att.get('fileName', '')
        url = att.get('url', '')
        if '宗地界址图' in dt or '勘测' in fname or '勘界' in fname:
            map_file = att
            break

    if not map_file:
        # 没有界址图，尝试第一份 PDF
        for att in attachments:
            if att.get('url', '').endswith('.pdf'):
                map_file = att
                break

    if not map_file or not map_file.get('url'):
        return {'status': 'no_pdf', 'note': '未找到宗地界址图附件'}

    url = map_file['url']
    file_id = map_file.get('fileId', '')
    file_name = map_file.get('fileName', '勘测图.pdf')

    # 下载 PDF
    safe_name = re.sub(r'[^\w\u4e00-\u9fff-]', '_', file_name)
    pdf_path = os.path.join(temp_dir, f"kandui_{source_id}_{safe_name}")

    if download_pdf(url, pdf_path):
        # 渲染
        result = extract_coordinates_from_pdf(pdf_path)
        result['pdf_path'] = pdf_path
        result['file_id'] = file_id
        result['file_name'] = file_name
        result['source_id'] = source_id
        if result['status'] == 'ok':
            result['status'] = 'rendered'
        return result
    else:
        return {'status': 'download_failed', 'note': f'下载失败: {url}'}


def save_to_excel(records, output_path, sheet_name="成交公示",
                  include_coords=False, include_map=False, temp_dir='/tmp'):
    """保存到Excel

    Args:
        records: 公示记录列表
        output_path: 输出文件路径
        sheet_name: 工作表名
        include_coords: 是否下载并渲染勘测图（慢，建议只对少量记录使用）
        temp_dir: 临时目录
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = sheet_name

    # 根据是否包含坐标决定列
    if include_coords:
        columns = [
            '公示编号', '公示标题', '行政区',
            '地块编号（宗地编码）', '地块位置',
            '土地用途', '土地面积(亩)', '土地面积(平方米)',
            '出让年限', '起始单价(元/平方米)', '起始总价(万元)',
            '成交单价(元/平方米)', '成交总价(万元)', '受让单位',
            '发布时间', '详情页网址',
            '坐标类型', '坐标中心经度', '坐标中心纬度',
            'X坐标起点', 'Y坐标起点', '边界点组数', '边界点总数',
            '坐标数据文件',
        ]
        if include_map:
            columns.append('地图文件')
    else:
        columns = [
            '公示编号', '公示标题', '行政区',
            '地块编号（宗地编码）', '地块位置',
            '土地用途', '土地面积(亩)', '土地面积(平方米)',
            '出让年限', '起始单价(元/平方米)', '起始总价(万元)',
            '成交单价(元/平方米)', '成交总价(万元)', '受让单位',
            '发布时间', '详情页网址',
        ]

    for col, header in enumerate(columns, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True)
        cell.alignment = Alignment(horizontal='center')

    coord_rows = []
    for row_idx, r in enumerate(records, 2):
        detail = parse_content_fields(r.get('content', ''))
        source_code = r.get('sourceCode', '')
        publicity_id = r.get('publicityId', '')
        source_id = r.get('sourceId', '')

        # 计算平方米
        area_mu = detail.get('土地面积(亩)', '')
        area_sqm = ''
        area_sqm_num = None
        if area_mu:
            try:
                area_sqm_num = round(float(re.search(r'\d+\.?\d*', area_mu).group()) * 666.67, 2)
                area_sqm = area_sqm_num
            except Exception:
                area_sqm = ''
                area_sqm_num = None

        # 清洗单价
        start_unit_price = ''
        start_total_price = ''
        deal_unit_price = extract_number(detail.get('成交结果', ''))
        deal_total_price = calc_total_price_wan(deal_unit_price, area_mu=area_mu, area_sqm=area_sqm_num)

        # 详情页 URL（source-detail 格式）
        detail_url = (
            f"https://www.zjzrzyjy.com/landView/land-bidding/source-detail?resourceId={source_id}"
            if source_id else ''
        )

        coord = {}
        if include_coords and source_id:
            detail_data = fetch_resource_detail(source_id)
            coord = normalize_resource_coordinate(detail_data.get('resourceCoordinate', ''))
            detail_area_sqm = extract_number(detail_data.get('assignmentArea'))
            if detail_area_sqm is None:
                detail_area_sqm = area_sqm_num
            start_unit_price = extract_number(detail_data.get('startPrice', ''))
            deal_unit_price = extract_number(detail_data.get('dealPrice', deal_unit_price))
            start_total_price = calc_total_price_wan(start_unit_price, area_mu=area_mu, area_sqm=detail_area_sqm)
            deal_total_price = calc_total_price_wan(deal_unit_price, area_mu=area_mu, area_sqm=detail_area_sqm)
            coord_rows.append({
                'sourceCode': source_code,
                'districtName': r.get('districtName', ''),
                'releaseTime': r.get('releaseTime', ''),
                '_detail_url': detail_url,
                '_location': detail_data.get('resourceLocation', detail.get('地块位置', '')),
                '_area_mu': area_mu,
                '_use': detail_data.get('assignmentPeriod', detail.get('土地用途', '')),
                '_start_unit_price': start_unit_price if start_unit_price is not None else '',
                '_start_total_price_wan': start_total_price,
                '_deal_unit_price': deal_unit_price if deal_unit_price is not None else '',
                '_deal_total_price_wan': deal_total_price,
                '_assignment_area_sqm': detail_area_sqm if detail_area_sqm is not None else '',
                '_coord': coord,
            })
        else:
            detail_data = {}
            coord = {}

        coord_json_file = ''
        map_file = ''
        if include_coords and not include_map and source_id and coord:
            # 仅导出坐标时也保留一份本地 JSON，方便后续制图
            pass

        if include_coords:
            center = coord.get('center', {})
            row_data = [
                publicity_id,
                source_code,
                r.get('districtName', ''),
                source_code,
                detail.get('地块位置', ''),
                detail.get('土地用途', ''),
                area_mu,
                area_sqm,
                detail.get('出让年限', ''),
                start_unit_price,
                start_total_price,
                deal_unit_price,
                deal_total_price,
                detail.get('受让单位', ''),
                r.get('releaseTime', ''),
                detail_url,
                coord.get('locationType', ''),
                center.get('lng', ''),
                center.get('lat', ''),
                center.get('originLng', ''),
                center.get('originLat', ''),
                coord.get('group_count', ''),
                coord.get('point_count', ''),
                coord_json_file,
            ]
            if include_map:
                row_data.append(map_file)
        else:
            row_data = [
                publicity_id,
                source_code,
                r.get('districtName', ''),
                source_code,
                detail.get('地块位置', ''),
                detail.get('土地用途', ''),
                area_mu,
                area_sqm,
                detail.get('出让年限', ''),
                start_unit_price,
                start_total_price,
                deal_unit_price,
                deal_total_price,
                detail.get('受让单位', ''),
                r.get('releaseTime', ''),
                detail_url,
            ]

        for col, val in enumerate(row_data, 1):
            ws.cell(row=row_idx, column=col, value=val)

        if (row_idx - 1) % 20 == 0:
            print(f"  已处理 {row_idx - 1} 条记录...")

    map_assets = None
    if include_coords and include_map:
        map_assets = build_map_assets(coord_rows, output_path)
        # 回填坐标数据文件和地图文件
        for row_idx in range(2, len(records) + 2):
            ws.cell(row=row_idx, column=columns.index('坐标数据文件') + 1).value = map_assets['coord_json']
            ws.cell(row=row_idx, column=columns.index('地图文件') + 1).value = map_assets['map_html']

    elif include_coords:
        # 仅导出坐标时，也写一个 JSON 文件便于下游复用
        coord_json_path = str(Path(output_path).with_suffix('')) + "_coords.json"
        with open(coord_json_path, 'w', encoding='utf-8') as f:
            json.dump(coord_rows, f, ensure_ascii=False, indent=2)
        for row_idx in range(2, len(records) + 2):
            ws.cell(row=row_idx, column=columns.index('坐标数据文件') + 1).value = coord_json_path

    # 自动调整列宽
    for col_idx in range(1, len(columns) + 1):
        max_len = max(
            len(str(ws.cell(row=r, column=col_idx).value or ''))
            for r in range(1, len(records) + 2)
        )
        ws.column_dimensions[get_column_letter(col_idx)].width = min(max_len + 2, 50)

    os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
    wb.save(output_path)
    print(f"\n✅ 已保存: {output_path}")
    return len(records)


# ============================================================
#  主入口
# ============================================================

if __name__ == "__main__":
    # 默认抓取绍兴市，可通过参数指定
    # 用法:
    #   python scrape_zj_land.py
    #   python scrape_zj_land.py 绍兴
    #   python scrape_zj_land.py 绍兴 2025
    #   python scrape_zj_land.py 绍兴 2025 /path/to/output.xlsx
    #   python scrape_zj_land.py 绍兴 2025 /path/to/output.xlsx --coords --map
    #   python scrape_zj_land.py 某区 2023 /path/to/output.xlsx --coords --map --district-exact

    parser = argparse.ArgumentParser(description="抓取浙江自然资源土地成交公示")
    parser.add_argument("district_name", nargs="?", default=None, help="行政区关键词，例如 绍兴、镇海区")
    parser.add_argument("start_year", nargs="?", default=None, help="起始年份，例如 2025")
    parser.add_argument("output_path", nargs="?", default=None, help="输出 Excel 路径")
    parser.add_argument("--coords", action="store_true", help="导出坐标字段，并生成坐标 JSON")
    parser.add_argument("--map", dest="include_map", action="store_true", help="生成地图 HTML/JS（会同时导出坐标）")
    parser.add_argument("--district-exact", action="store_true", help="按 districtName 精确匹配")
    args = parser.parse_args()

    district_name = args.district_name
    start_year = args.start_year
    output_path = args.output_path
    include_coords = bool(args.coords or args.include_map)
    include_map = bool(args.include_map)

    if not district_name or not start_year:
        print("请先提供以下信息后再抓取：")
        print("1. 行政区名称（例如 绍兴、镇海区）")
        print("2. 起始年份（例如 2025）")
        print("3. 是否需要精确匹配 districtName（可选，适合区县名）")
        print("4. 是否导出坐标/地图（可选，使用 --coords / --map）")
        print("5. 输出文件路径（可选，不填则自动命名）")
        print("\n示例：")
        print('python scrape_zj_land.py 绍兴 2025 "/path/to/output.xlsx" --coords --map')
        raise SystemExit(2)

    if output_path is None:
        import platform
        if platform.system() == 'Darwin':
            output_path = f"/Volumes/A区/下载/{district_name}工业用地成交公示_{start_year}以来.xlsx"
        else:
            output_path = rf"C:\Users\Administrator\Desktop\{district_name}工业用地成交公示_{start_year}以来.xlsx"

    print(f"开始抓取 - {district_name}市 {start_year}年以来成交公示")
    print(f"坐标导出: {'开启' if include_coords else '关闭'}")
    print(f"地图输出: {'开启' if include_map else '关闭'}")
    print("=" * 60)

    records = fetch_records(district_filter={'name': district_name, 'exact': args.district_exact})
    print(f"\n共获取: {len(records)} 条记录")

    # 按年份过滤（如果 releaseTime 格式为 2026年04月17日）
    if start_year:
        filtered = []
        for r in records:
            rt = r.get('releaseTime', '')
            if rt and rt.startswith(start_year):
                filtered.append(r)
        print(f"过滤 {start_year} 年后: {len(filtered)} 条")
        records = filtered

    if records:
        count = save_to_excel(
            records, output_path,
            sheet_name=f"{district_name}成交公示",
            include_coords=include_coords,
            include_map=include_map,
        )
        print(f"\n完成！共 {count} 条记录")
        if include_map:
            stem = str(Path(output_path).with_suffix(''))
            print(f"地图文件: {stem}_map.html")
            print(f"坐标JSON: {stem}_coords.json")
    else:
        print("\n⚠️ 未获取到任何记录，请检查行政区名称是否正确")
