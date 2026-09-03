#!/usr/bin/env python3
"""受控运行器：复用浙江土地成交公示 Skill，并生成 Excel/独立结果页。

核心列表抓取和 HTML 详情解析继续来自 scrape_zj_land.py。本文件只负责
参数契约、列表候选过滤、详情复核、结果页和安全的原子输出，避免把业务逻辑塞进 Native Host。
"""

from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import os
import re
import shutil
import sys
import tempfile
import uuid
import zipfile
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from scrape_zj_land import (
    build_map_assets,
    calc_total_price_wan,
    clean_text,
    extract_number,
    fetch_records as skill_fetch_records,
    fetch_resource_detail,
    normalize_resource_coordinate,
    parse_content_fields,
)


TRADE_FORMS = ("国有土地", "国有土地（组合）")
TRADE_METHODS = ("挂牌出让", "挂牌租赁", "拍卖出让", "拍卖租赁")
TRADE_STAGES = ("结果公示",)
LAND_USES = ("住宅用地", "商服用地", "工矿仓储", "其他用地")
TRADE_METHOD_CODES = {
    "挂牌出让": ("GP",),
    "拍卖出让": ("PM",),
    "挂牌租赁": ("GPZL",),
    "拍卖租赁": ("PMZL",),
}
QUOTE_PRESETS = ("all", "today", "future_3_days", "future_7_days", "future_30_days", "custom")
DISTRICTS = ("杭州市", "宁波市", "温州市", "湖州市", "嘉兴市", "绍兴市", "金华市", "衢州市", "舟山市", "台州市", "丽水市")
CITY_CODE_PREFIXES = {
    "杭州": "3301",
    "宁波": "3302",
    "温州": "3303",
    "嘉兴": "3304",
    "湖州": "3305",
    "绍兴": "3306",
    "金华": "3307",
    "衢州": "3308",
    "舟山": "3309",
    "台州": "3310",
    "丽水": "3311",
}


def emit_progress(phase: str, percent: int, message: str, **counts: Any) -> None:
    payload = {
        "phase": str(phase),
        "percent": max(0, min(100, int(percent))),
        "message": str(message),
        **counts,
    }
    print("TY_LAND_PROGRESS:" + json.dumps(payload, ensure_ascii=False, separators=(",", ":")), flush=True)


def emit_result(payload: Dict[str, Any]) -> None:
    print("TY_LAND_RESULT:" + json.dumps(payload, ensure_ascii=False, separators=(",", ":")), flush=True)


def _text(value: Any, limit: int = 300) -> str:
    return clean_text(str(value or ""))[:limit]


def _number(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    match = re.search(r"-?\d+(?:,\d{3})*(?:\.\d+)?", str(value))
    if not match:
        return None
    try:
        return float(match.group(0).replace(",", ""))
    except ValueError:
        return None


def _date(value: Any) -> Optional[dt.date]:
    text = _text(value, 80)
    if not text:
        return None
    text = text.replace("年", "-").replace("月", "-").replace("日", "")
    text = text.replace("/", "-").replace(".", "-")
    match = re.search(r"(\d{4})-(\d{1,2})-(\d{1,2})", text)
    if not match:
        return None
    try:
        return dt.date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
    except ValueError:
        return None


def _date_text(value: Any) -> str:
    parsed = _date(value)
    return parsed.isoformat() if parsed else _text(value, 80)


def _normalise_district_name(value: Any) -> str:
    return re.sub(r"\s+", "", _text(value, 100)).casefold()


def _city_code_for_district(value: Any) -> str:
    name = _normalise_district_name(value)
    if name.endswith("市"):
        name = name[:-1]
    return CITY_CODE_PREFIXES.get(name, "")


def _district_code_prefix(value: Any) -> str:
    digits = re.sub(r"\D", "", _text(value, 40))
    return digits[:4] if len(digits) >= 4 else ""


def _district_matches(request: Dict[str, Any], record: Dict[str, Any]) -> bool:
    if request.get("provinceWide") or not request.get("district"):
        return True
    requested = _normalise_district_name(request["district"])
    district_name = _normalise_district_name(record.get("districtName"))
    city_code = _city_code_for_district(request["district"])
    if city_code:
        actual_code = _district_code_prefix(record.get("districtCode"))
        if actual_code:
            return actual_code == city_code
        # Older captures may omit districtCode. Keep the name fallback for
        # those records, while a present code remains authoritative.
        requested_city = requested[:-1] if requested.endswith("市") else requested
        actual_city = district_name[:-1] if district_name.endswith("市") else district_name
        return requested_city == actual_city
    if request.get("districtExact"):
        return requested == district_name
    return requested in district_name


def _list_district_filter(request: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """减少详情请求：列表接口先按已知行政区代码/名称预筛选。"""
    if request.get("provinceWide"):
        return None
    district = _text(request.get("district"), 100)
    if district:
        city_code = _city_code_for_district(district)
        if city_code:
            return {"code": city_code, "exact": False}
        return {"name": district, "exact": bool(request.get("districtExact"))}
    location = _text(request.get("location"), 160)
    if re.search(r"(市|区|县)$", location):
        return {"name": location, "exact": bool(request.get("districtExact"))}
    return None


def _list_record_matches_request(request: Dict[str, Any], record: Dict[str, Any]) -> bool:
    """在列表记录阶段安全收窄候选，缺失字段一律留给详情阶段复核。"""
    release_date = _date(record.get("releaseTime"))
    start_boundary = _date(request.get("startDate"))
    if start_boundary is None and request.get("startYear"):
        start_boundary = dt.date(int(request["startYear"]), 1, 1)
    end_boundary = _date(request.get("endDate"))
    if release_date and start_boundary and release_date < start_boundary:
        return False
    if release_date and end_boundary and release_date > end_boundary:
        return False

    content_fields = parse_content_fields(record.get("content", ""))
    if request.get("landUses"):
        values = _field_values(record, content_fields, ("landUse", "use", "assignmentPurpose", "用途", "土地用途"))
        if values and not _contains_any(values, request["landUses"]):
            return False

    if request.get("tradeMethods"):
        values = _field_values(record, {}, ("tradeType", "tradeMethod", "tradeWay", "dealType", "交易方式"))
        if values and not _contains_any(values, request["tradeMethods"]):
            return False

    if request.get("tradeForm"):
        values = _field_values(record, {}, ("tradeForm", "transactionForm", "交易形式"))
        if values and not _contains_any(values, (request["tradeForm"],)):
            return False

    location_keyword = _text(request.get("location"), 160).lower()
    if location_keyword:
        list_location = _text(content_fields.get("地块位置"), 300)
        if list_location and location_keyword not in f"{_text(record.get('districtName'))} {list_location}".lower():
            return False
    return True


def _list_stop_before(request: Dict[str, Any]) -> str:
    start_boundary = _date(request.get("startDate"))
    if start_boundary is None and request.get("startYear"):
        start_boundary = dt.date(int(request["startYear"]), 1, 1)
    return start_boundary.isoformat() if start_boundary else ""


def _date_epoch_ms(value: Any, end_of_day: bool = False) -> Optional[int]:
    parsed = _date(value)
    if parsed is None:
        return None
    boundary = dt.time.max if end_of_day else dt.time.min
    moment = dt.datetime.combine(parsed, boundary, tzinfo=dt.timezone(dt.timedelta(hours=8)))
    return int(moment.timestamp() * 1000)


def _list_server_filters(request: Dict[str, Any]) -> Dict[str, Any]:
    """生成官网列表 API 已验证支持的业务筛选参数。"""
    filters: Dict[str, Any] = {}
    if not request.get("provinceWide"):
        region_name = _text(request.get("district"), 100)
        location = _text(request.get("location"), 160)
        if re.fullmatch(r".+(?:市|区|县)", location):
            filters["regionName"] = location
            if region_name and region_name != location:
                filters["fallbackRegionName"] = region_name
        elif region_name:
            filters["regionName"] = region_name
    start_ms = _date_epoch_ms(request.get("startDate"))
    end_ms = _date_epoch_ms(request.get("endDate"), end_of_day=True)
    if start_ms is not None:
        filters["publishStartTime"] = start_ms
    elif request.get("startYear"):
        filters["publishStartTime"] = _date_epoch_ms(f"{request['startYear']}-01-01")
    if end_ms is not None:
        filters["publishEndTime"] = end_ms
    return filters


def _list(value: Any, allowed: Iterable[str], field: str) -> List[str]:
    if value in (None, ""):
        return []
    if not isinstance(value, list):
        raise ValueError(f"{field}_MUST_BE_ARRAY")
    values = [_text(item, 40) for item in value]
    if len(values) > len(tuple(allowed)):
        raise ValueError(f"{field}_TOO_MANY")
    allowed_set = set(allowed)
    if any(item not in allowed_set for item in values):
        raise ValueError(f"{field}_INVALID")
    return list(dict.fromkeys(values))


def validate_request(request: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(request, dict):
        raise ValueError("LAND_REQUEST_INVALID")
    for boolean_field in ("districtExact", "generateMap", "provinceWide"):
        if boolean_field in request and not isinstance(request[boolean_field], bool):
            raise ValueError(f"{boolean_field.upper()}_MUST_BE_BOOLEAN")
    output_directory = _text(request.get("outputDirectory"), 2000)
    if not output_directory or "\x00" in output_directory or not os.path.isabs(output_directory):
        raise ValueError("LAND_OUTPUT_DIRECTORY_INVALID")
    output_directory = os.path.realpath(output_directory)
    if not os.path.isdir(output_directory):
        raise ValueError("LAND_OUTPUT_DIRECTORY_NOT_DIRECTORY")

    start_year = request.get("startYear", "")
    if start_year not in (None, ""):
        start_year = _text(start_year, 4)
        if not re.fullmatch(r"(?:19|20)\d{2}", start_year):
            raise ValueError("LAND_START_YEAR_INVALID")
    else:
        start_year = ""
    start_date = _text(request.get("startDate"), 20)
    if start_date and (_date(start_date) is None or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", start_date)):
        raise ValueError("LAND_START_DATE_INVALID")
    end_date = _text(request.get("endDate"), 20)
    if end_date and (_date(end_date) is None or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", end_date)):
        raise ValueError("LAND_END_DATE_INVALID")
    if start_date and end_date and _date(start_date) > _date(end_date):
        raise ValueError("LAND_DATE_RANGE_INVALID")
    if not start_date and not start_year:
        raise ValueError("LAND_START_DATE_OR_YEAR_REQUIRED")

    trade_form = _text(request.get("tradeForm"), 40)
    if trade_form and trade_form not in TRADE_FORMS:
        raise ValueError("LAND_TRADE_FORM_INVALID")
    quote_preset = _text(request.get("quotePreset") or "all", 30)
    if quote_preset not in QUOTE_PRESETS:
        raise ValueError("LAND_QUOTE_PRESET_INVALID")
    quote_start = _text(request.get("quoteStartDate"), 20)
    quote_end = _text(request.get("quoteEndDate"), 20)
    for label, value in (("LAND_QUOTE_START_DATE_INVALID", quote_start), ("LAND_QUOTE_END_DATE_INVALID", quote_end)):
        if value and (_date(value) is None or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value)):
            raise ValueError(label)
    if quote_preset == "custom" and not quote_start and not quote_end:
        raise ValueError("LAND_QUOTE_CUSTOM_RANGE_REQUIRED")
    if quote_start and quote_end and _date(quote_start) > _date(quote_end):
        raise ValueError("LAND_QUOTE_RANGE_INVALID")

    area_unit = _text(request.get("areaUnit") or "sqm", 8)
    if area_unit not in ("sqm", "mu"):
        raise ValueError("LAND_AREA_UNIT_INVALID")

    def range_value(key: str) -> Optional[float]:
        value = request.get(key, "")
        if value in (None, ""):
            return None
        number = _number(value)
        if number is None or number < 0:
            raise ValueError(f"{key.upper()}_INVALID")
        if number > 10**12:
            raise ValueError(f"{key.upper()}_TOO_LARGE")
        return number

    price_min = range_value("startPriceMin")
    price_max = range_value("startPriceMax")
    area_min = range_value("areaMin")
    area_max = range_value("areaMax")
    if price_min is not None and price_max is not None and price_min > price_max:
        raise ValueError("LAND_START_PRICE_RANGE_INVALID")
    if area_min is not None and area_max is not None and area_min > area_max:
        raise ValueError("LAND_AREA_RANGE_INVALID")

    max_pages = request.get("maxPages", 50)
    try:
        max_pages = int(max_pages)
    except (TypeError, ValueError):
        raise ValueError("LAND_MAX_PAGES_INVALID")
    if isinstance(request.get("maxPages"), bool) or max_pages < 1 or max_pages > 200:
        raise ValueError("LAND_MAX_PAGES_INVALID")

    district = _text(request.get("district"), 100)
    location = _text(request.get("location"), 160)
    province_wide = bool(request.get("provinceWide", False))
    if not province_wide and not district and not location:
        raise ValueError("LAND_DISTRICT_OR_LOCATION_REQUIRED")
    if district and len(district) > 100:
        raise ValueError("LAND_DISTRICT_TOO_LONG")
    return {
        "tradeForm": trade_form,
        "tradeMethods": _list(request.get("tradeMethods"), TRADE_METHODS, "tradeMethods"),
        "tradeStages": _list(request.get("tradeStages"), TRADE_STAGES, "tradeStages"),
        "district": district,
        "location": location,
        "landUses": _list(request.get("landUses"), LAND_USES, "landUses"),
        "startDate": start_date,
        "endDate": end_date,
        "startYear": start_year,
        "quotePreset": quote_preset,
        "quoteStartDate": quote_start,
        "quoteEndDate": quote_end,
        "startPriceMin": price_min,
        "startPriceMax": price_max,
        "areaMin": area_min,
        "areaMax": area_max,
        "areaUnit": area_unit,
        "districtExact": bool(request.get("districtExact", False)),
        "provinceWide": province_wide,
        "generateMap": bool(request.get("generateMap", False)),
        "maxPages": max_pages,
        "outputDirectory": output_directory,
    }


def _field_values(record: Dict[str, Any], detail: Dict[str, Any], names: Iterable[str]) -> List[str]:
    values: List[str] = []
    for name in names:
        for source in (record, detail):
            value = source.get(name) if isinstance(source, dict) else None
            text = _text(value)
            if text and text not in values:
                values.append(text)
    return values


def _contains_any(values: Iterable[str], choices: Iterable[str]) -> bool:
    normalised_values = [str(value).strip().lower() for value in values if str(value).strip()]
    haystack = " ".join(normalised_values)
    aliases = {
        "挂牌出让": ("挂牌出让", "挂牌"),
        "拍卖出让": ("拍卖出让", "拍卖"),
        "挂牌租赁": ("挂牌租赁",),
        "拍卖租赁": ("拍卖租赁",),
        "工矿仓储": ("工矿仓储", "工业用地", "仓储用地", "工业"),
        "商服用地": ("商服用地", "商服", "商业", "商业服务"),
        "住宅用地": ("住宅用地", "住宅", "居住"),
        "其他用地": ("其他用地", "其他"),
        "结果公示": ("结果公示", "成交公示", "成交"),
    }
    for choice in choices:
        if any(code.lower() == value for code in TRADE_METHOD_CODES.get(choice, ()) for value in normalised_values):
            return True
        if any(alias.lower() in haystack for alias in aliases.get(choice, (choice,))):
            return True
    return False


def _quote_window(request: Dict[str, Any], today: Optional[dt.date] = None) -> Tuple[Optional[dt.date], Optional[dt.date]]:
    today = today or dt.date.today()
    preset = request["quotePreset"]
    if preset == "all":
        return None, None
    if preset == "today":
        return today, today
    if preset == "future_3_days":
        return today, today + dt.timedelta(days=3)
    if preset == "future_7_days":
        return today, today + dt.timedelta(days=7)
    if preset == "future_30_days":
        return today, today + dt.timedelta(days=30)
    return _date(request.get("quoteStartDate")), _date(request.get("quoteEndDate"))


def filter_records(
    enriched: List[Dict[str, Any]],
    request: Dict[str, Any],
    today: Optional[dt.date] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    warnings: List[str] = []
    unsupported: List[str] = []
    counts: Dict[str, int] = {"unknownStartPrice": 0, "unknownArea": 0, "unknownQuoteStart": 0}
    if request.get("tradeForm"):
        unsupported.append("交易形式：目标列表/详情 API 未提供稳定字段，仅在返回字段存在时作候选复核。")

    quote_start, quote_end = _quote_window(request, today=today)
    output: List[Dict[str, Any]] = []
    start_boundary = _date(request.get("startDate"))
    if start_boundary is None and request.get("startYear"):
        start_boundary = dt.date(int(request["startYear"]), 1, 1)
    end_boundary = _date(request.get("endDate"))

    for item in enriched:
        record = item["record"]
        detail = item["detail"]
        release_date = _date(record.get("releaseTime"))
        if start_boundary and (release_date is None or release_date < start_boundary):
            continue
        if end_boundary and (release_date is None or release_date > end_boundary):
            continue

        district = _text(record.get("districtName"))
        location = _text(item.get("location") or detail.get("地块位置"))
        if request["district"] and not request.get("provinceWide") and not _district_matches(request, record):
            continue
        if request["location"] and request["location"].lower() not in f"{district} {location}".lower():
            continue

        if request["landUses"]:
            values = _field_values(record, detail, ("landUse", "use", "assignmentPurpose", "用途", "土地用途"))
            if not _contains_any(values + [detail.get("土地用途", "")], request["landUses"]):
                continue

        if request["tradeMethods"]:
            values = _field_values(record, detail, ("tradeType", "tradeMethod", "tradeWay", "dealType", "交易方式"))
            if not values:
                continue
            if not _contains_any(values, request["tradeMethods"]):
                continue

        # This runner uses the Skill's type=3成交公示 endpoint. The source
        # itself is authoritative for the result-publicity stage even when an
        # individual record omits a tradeStage field.
        if request["tradeStages"] and request["tradeStages"] != ["结果公示"]:
            continue

        if request["tradeForm"]:
            values = _field_values(record, detail, ("tradeForm", "transactionForm", "交易形式"))
            if values and not _contains_any(values, (request["tradeForm"],)):
                continue

        if quote_start or quote_end:
            values = _field_values(record, detail, ("quoteStartTime", "quoteStartDate", "quoteBeginTime", "offerStartTime", "startTime", "报价开始时间"))
            quote_date = _date(values[0]) if values else None
            if quote_date is None:
                counts["unknownQuoteStart"] += 1
                continue
            if quote_start and quote_date < quote_start:
                continue
            if quote_end and quote_date > quote_end:
                continue

        start_price = item.get("start_price")
        if request["startPriceMin"] is not None or request["startPriceMax"] is not None:
            if start_price is None:
                counts["unknownStartPrice"] += 1
                continue
            if request["startPriceMin"] is not None and start_price < request["startPriceMin"]:
                continue
            if request["startPriceMax"] is not None and start_price > request["startPriceMax"]:
                continue

        area = item.get("area_sqm") if request["areaUnit"] == "sqm" else item.get("area_mu")
        if request["areaMin"] is not None or request["areaMax"] is not None:
            if area is None:
                counts["unknownArea"] += 1
                continue
            if request["areaMin"] is not None and area < request["areaMin"]:
                continue
            if request["areaMax"] is not None and area > request["areaMax"]:
                continue

        output.append(item)

    if counts["unknownStartPrice"]:
        warnings.append(f"{counts['unknownStartPrice']} 条记录缺少起始价，已从起始价区间筛选中排除。")
    if counts["unknownArea"]:
        warnings.append(f"{counts['unknownArea']} 条记录缺少出让面积，已从面积区间筛选中排除。")
    if counts["unknownQuoteStart"]:
        warnings.append(f"{counts['unknownQuoteStart']} 条记录缺少报价开始时间，已从报价时间筛选中排除。")
    if request["tradeMethods"] or request["tradeStages"] or request["landUses"]:
        unsupported.append("土地用途、交易方式或阶段等接口未提供稳定查询参数，系统在候选列表和详情阶段复核。")
    return output, {
        "warnings": warnings,
        "unsupportedFilters": unsupported,
        "unknown": counts,
        "filtered": len(output),
    }


def enrich_record(record: Dict[str, Any], detail_fetcher: Callable[[str], Dict[str, Any]]) -> Dict[str, Any]:
    detail = parse_content_fields(record.get("content", ""))
    source_id = _text(record.get("sourceId"), 200)
    detail_data: Dict[str, Any] = {}
    if source_id:
        try:
            detail_data = detail_fetcher(source_id) or {}
        except Exception:
            detail_data = {}
    coordinate = normalize_resource_coordinate(detail_data.get("resourceCoordinate", ""))
    area_mu = _number(detail.get("土地面积(亩)"))
    area_sqm = _number(detail_data.get("assignmentArea") or detail_data.get("transferArea") or detail_data.get("出让面积"))
    if area_sqm is None and area_mu is not None:
        area_sqm = round(area_mu * 666.67, 2)
    start_price = _number(detail_data.get("startPrice") or detail_data.get("startingPrice") or detail_data.get("起始价"))
    deal_price = _number(detail_data.get("dealPrice") or detail_data.get("成交价"))
    if deal_price is None:
        deal_price = _number(detail.get("成交结果"))
    detail_url = (
        f"https://www.zjzrzyjy.com/landView/land-bidding/source-detail?resourceId={source_id}"
        if source_id else ""
    )
    location = _text(detail_data.get("resourceLocation") or detail.get("地块位置"))
    land_use = _text(detail_data.get("assignmentPurpose") or detail_data.get("landUse") or detail.get("土地用途"))
    return {
        "record": record,
        "detail": detail,
        "detail_data": detail_data,
        "coord": coordinate,
        "source_id": source_id,
        "detail_url": detail_url,
        "location": location,
        "land_use": land_use,
        "area_mu": area_mu,
        "area_sqm": area_sqm,
        "start_price": start_price,
        "start_total_price": calc_total_price_wan(start_price, area_sqm=area_sqm) if start_price is not None else "",
        "deal_price": deal_price,
        "deal_total_price": calc_total_price_wan(deal_price, area_sqm=area_sqm) if deal_price is not None else "",
    }


def _coord_fields(item: Dict[str, Any]) -> Dict[str, Any]:
    coord = item.get("coord") or {}
    center = coord.get("center") or {}
    has_center = center.get("lng") not in (None, "") and center.get("lat") not in (None, "")
    return {
        "坐标状态": "有坐标" if has_center else "无坐标（详情接口未返回）",
        "坐标类型": coord.get("locationType", ""),
        "坐标中心经度": center.get("lng", "") if has_center else "",
        "坐标中心纬度": center.get("lat", "") if has_center else "",
        "X坐标起点": center.get("originLng", "") if has_center else "",
        "Y坐标起点": center.get("originLat", "") if has_center else "",
        "边界点组数": coord.get("group_count", "") if has_center else "",
        "边界点总数": coord.get("point_count", "") if has_center else "",
    }


OUTPUT_COLUMNS = [
    "公示编号", "公示标题", "行政区", "地块编号（宗地编码）", "地块位置", "土地用途",
    "土地面积(亩)", "土地面积(平方米)", "出让年限", "起始单价(元/平方米)", "起始总价(万元)",
    "成交单价(元/平方米)", "成交总价(万元)", "受让单位", "发布时间", "详情页网址",
    "交易形式", "交易方式", "交易阶段", "报价开始时间", "坐标状态", "坐标类型",
    "坐标中心经度", "坐标中心纬度", "X坐标起点", "Y坐标起点", "边界点组数", "边界点总数",
    "坐标数据文件", "地图文件",
]


def row_from_item(item: Dict[str, Any], coord_path: str = "", map_path: str = "") -> Dict[str, Any]:
    record = item["record"]
    detail = item["detail"]
    detail_data = item["detail_data"]
    row = {
        "公示编号": _text(record.get("publicityId")),
        "公示标题": _text(record.get("sourceCode")),
        "行政区": _text(record.get("districtName")),
        "地块编号（宗地编码）": _text(record.get("sourceCode")),
        "地块位置": item["location"],
        "土地用途": item["land_use"],
        "土地面积(亩)": item["area_mu"] if item["area_mu"] is not None else "",
        "土地面积(平方米)": item["area_sqm"] if item["area_sqm"] is not None else "",
        "出让年限": _text(detail.get("出让年限")),
        "起始单价(元/平方米)": item["start_price"] if item["start_price"] is not None else "",
        "起始总价(万元)": item["start_total_price"],
        "成交单价(元/平方米)": item["deal_price"] if item["deal_price"] is not None else "",
        "成交总价(万元)": item["deal_total_price"],
        "受让单位": _text(detail.get("受让单位")),
        "发布时间": _date_text(record.get("releaseTime")),
        "详情页网址": item["detail_url"],
        "交易形式": _text(record.get("tradeForm") or detail_data.get("tradeForm") or ""),
        "交易方式": _text(record.get("tradeType") or detail_data.get("tradeType") or ""),
        "交易阶段": _text(record.get("tradeStage") or detail_data.get("tradeStage") or ""),
        "报价开始时间": _date_text(record.get("quoteStartTime") or detail_data.get("quoteStartTime") or ""),
        "坐标数据文件": coord_path,
        "地图文件": map_path,
    }
    row.update(_coord_fields(item))
    return row


def _filter_condition_summary(request: Dict[str, Any]) -> str:
    conditions: List[str] = []
    if request.get("provinceWide"):
        conditions.append("行政区=全省/不限制行政区")
    elif request.get("district"):
        district = _text(request.get("district"), 100)
        suffix = "（districtName精确匹配）" if request.get("districtExact") else ""
        conditions.append(f"行政区={district}{suffix}")
    if request.get("location"):
        conditions.append(f"位置关键词={_text(request.get('location'), 160)}")
    if request.get("tradeForm"):
        conditions.append(f"交易形式={_text(request.get('tradeForm'), 40)}")
    if request.get("tradeMethods"):
        conditions.append(f"交易方式={'、'.join(request['tradeMethods'])}")
    if request.get("tradeStages"):
        conditions.append(f"交易阶段={'、'.join(request['tradeStages'])}")
    if request.get("landUses"):
        conditions.append(f"土地用途={'、'.join(request['landUses'])}")
    if request.get("startDate") or request.get("endDate"):
        start_date = request.get("startDate") or "不限"
        end_date = request.get("endDate") or "不限"
        conditions.append(f"成交公示日期={start_date}至{end_date}")
    if request.get("startYear"):
        conditions.append(f"起始年份≥{request['startYear']}")
    quote_preset = request.get("quotePreset") or "all"
    if quote_preset != "all":
        quote_labels = {
            "today": "今天",
            "future_3_days": "未来三天",
            "future_7_days": "未来七天",
            "future_30_days": "未来三十天",
            "custom": "自定义",
        }
        quote_text = quote_labels.get(quote_preset, quote_preset)
        if request.get("quoteStartDate") or request.get("quoteEndDate"):
            quote_text += f"({_text(request.get('quoteStartDate'), 20) or '不限'}至{_text(request.get('quoteEndDate'), 20) or '不限'})"
        conditions.append(f"报价开始时间={quote_text}")
    if request.get("startPriceMin") is not None or request.get("startPriceMax") is not None:
        price_min = request.get("startPriceMin") if request.get("startPriceMin") not in (None, "") else "不限"
        price_max = request.get("startPriceMax") if request.get("startPriceMax") not in (None, "") else "不限"
        conditions.append(f"起始价={price_min}至{price_max}")
    if request.get("areaMin") is not None or request.get("areaMax") is not None:
        unit = "亩" if request.get("areaUnit") == "mu" else "平方米"
        area_min = request.get("areaMin") if request.get("areaMin") not in (None, "") else "不限"
        area_max = request.get("areaMax") if request.get("areaMax") not in (None, "") else "不限"
        conditions.append(f"出让面积={area_min}至{area_max}{unit}")
    if request.get("maxPages"):
        conditions.append(f"抓取页数上限={request['maxPages']}")
    return "；".join(conditions) or "未设置额外筛选条件"


def write_excel(path: Path, rows: List[Dict[str, Any]], request: Dict[str, Any], summary: Dict[str, Any]) -> None:
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.title = "成交公示"
    header_fill = PatternFill("solid", fgColor="E8EEF8")
    for index, column in enumerate(OUTPUT_COLUMNS, 1):
        cell = sheet.cell(1, index, column)
        cell.font = Font(bold=True)
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")
    for row_index, row in enumerate(rows, 2):
        for column_index, column in enumerate(OUTPUT_COLUMNS, 1):
            value = row.get(column, "")
            sheet.cell(row_index, column_index, value)
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = f"A1:{get_column_letter(len(OUTPUT_COLUMNS))}{max(1, len(rows) + 1)}"
    for column_index, column in enumerate(OUTPUT_COLUMNS, 1):
        max_length = max([len(str(column))] + [len(str(sheet.cell(i, column_index).value or "")) for i in range(2, len(rows) + 2)])
        sheet.column_dimensions[get_column_letter(column_index)].width = min(max(12, max_length + 2), 42)

    summary_sheet = workbook.create_sheet("筛选说明")
    summary_sheet.append(["字段", "值"])
    for cell in summary_sheet[1]:
        cell.font = Font(bold=True)
        cell.fill = header_fill
    for key, value in [
        ("抓取页数上限", request["maxPages"]),
        ("抓取后记录数", summary.get("fetched", 0)),
        ("写出记录数", len(rows)),
        ("当前筛选条件", _filter_condition_summary(request)),
        ("过滤说明", "行政区和成交公示日期先作为列表查询条件；土地用途、位置关键词、交易方式和交易阶段等条件再由候选列表及详情复核。"),
        ("限制与警告", "；".join(summary.get("warnings", []) + summary.get("unsupportedFilters", [])) or "无"),
    ]:
        summary_sheet.append([key, value])
    summary_sheet.column_dimensions["A"].width = 22
    summary_sheet.column_dimensions["B"].width = 100
    workbook.save(path)
    with zipfile.ZipFile(path, "r") as archive:
        if archive.testzip():
            raise ValueError("LAND_EXCEL_ARCHIVE_INVALID")


def _table_cell(value: Any) -> str:
    return html.escape("" if value is None else str(value))


def write_result_html(path: Path, rows: List[Dict[str, Any]], request: Dict[str, Any], summary: Dict[str, Any], file_names: Dict[str, str]) -> None:
    columns = [
        "公示编号", "公示标题", "行政区", "地块编号（宗地编码）", "地块位置", "土地用途",
        "土地面积(亩)", "土地面积(平方米)", "出让年限", "起始单价(元/平方米)", "起始总价(万元)",
        "成交单价(元/平方米)", "成交总价(万元)", "受让单位", "发布时间", "详情页网址",
        "交易方式", "交易阶段", "报价开始时间", "坐标状态",
    ]
    header = "".join(f"<th>{_table_cell(column)}</th>" for column in columns)
    body_parts: List[str] = []
    for row in rows:
        no_coord = row.get("坐标状态", "").startswith("无坐标")
        css = " class=\"no-coordinate\"" if no_coord else ""
        cells_parts = []
        for column in columns:
            value = row.get(column, "")
            if column == "详情页网址" and value:
                safe_url = _table_cell(value)
                cells_parts.append(f'<td><a href="{safe_url}" target="_blank" rel="noopener">打开详情</a></td>')
            else:
                cells_parts.append(f"<td>{_table_cell(value)}</td>")
        cells = "".join(cells_parts)
        body_parts.append(f"<tr{css}>{cells}</tr>")
    body = "".join(body_parts) or f'<tr><td colspan="{len(columns)}" class="empty">没有符合条件的记录</td></tr>'
    empty_notice = ""
    if not rows:
        conditions = _table_cell(_filter_condition_summary(request))
        advice = "建议检查成交公示日期、行政区或位置关键词，以及接口返回是否存在记录。"
        if request.get("maxPages") == 1 and (request.get("district") or request.get("location")):
            advice = "当前只抓第1页；列表按发布时间倒序，目标行政区可能不在最新50条中，请改为50页（行政区推荐）后重试。"
        empty_notice = (
            '<section class="card empty-result-notice"><h2>结果为 0 条</h2>'
            f'<p>当前筛选条件：{conditions}</p>'
            f'<p>{advice}</p></section>'
        )
    coordinate_count = sum(1 for row in rows if row.get("坐标状态") == "有坐标")
    missing_coordinate_count = sum(1 for row in rows if row.get("坐标状态", "").startswith("无坐标"))
    warnings = summary.get("warnings", []) + summary.get("unsupportedFilters", [])
    warning_html = "".join(f"<li>{_table_cell(item)}</li>" for item in warnings)
    warning_block = (
        f'<details class="filter-notes"><summary>查看筛选说明</summary><ul>{warning_html}</ul></details>'
        if warnings else ""
    )
    map_name = file_names.get("map", "")
    map_block = (
        f'<div class="map-actions"><a class="button" href="{_table_cell(map_name)}" target="_blank" rel="noopener">查看地图</a></div>'
        f'<iframe title="地图预览" src="{_table_cell(map_name)}"></iframe>'
        if map_name else '<div class="map-actions"><button class="button secondary" type="button" disabled>查看地图（本次未生成）</button></div><div class="map-empty">未勾选生成地图；结果中仍标注每条记录的坐标状态。</div>'
    )
    excel_name = file_names["excel"]
    html_content = f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>浙江土地成交公示结果</title>
<style>
body{{margin:0;background:#f5f7fb;color:#1c2430;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}}
main{{max-width:1440px;margin:0 auto;padding:28px}}h1{{margin:0 0 8px;font-size:25px}}h2{{margin:0 0 12px;font-size:18px}}.muted{{color:#667085}}
.card{{background:#fff;border:1px solid #e5e9f0;border-radius:14px;padding:18px;margin:16px 0;box-shadow:0 4px 18px #1d29390d}}
.actions{{display:flex;gap:10px;flex-wrap:wrap}}.button{{display:inline-block;padding:8px 13px;border-radius:8px;background:#2457c5;color:#fff;text-decoration:none}}.button.secondary{{background:#eef3ff;color:#2457c5}}
.stats{{display:flex;gap:28px;flex-wrap:wrap}}.stat strong{{display:block;font-size:22px}}.stat span{{color:#667085}}.result-summary{{margin:12px 0 0}}.filter-notes{{margin-top:14px;color:#8b5e00}}.filter-notes summary{{cursor:pointer;color:#667085}}.filter-notes ul{{margin:8px 0 0;padding-left:20px}}
.table-wrap{{overflow:auto}}table{{border-collapse:collapse;width:100%;min-width:980px}}th,td{{border-bottom:1px solid #edf0f5;padding:9px 10px;text-align:left;white-space:nowrap}}th{{background:#f8fafc;position:sticky;top:0}}tr.no-coordinate{{background:#fff8e6}}.empty{{text-align:center;color:#667085;padding:30px}}
iframe{{width:100%;height:520px;border:1px solid #e5e9f0;border-radius:10px}}.map-empty{{padding:20px;color:#667085;background:#f8fafc;border-radius:10px}}li{{margin:6px 0;color:#8b5e00}}
</style></head><body><main>
<h1>浙江土地成交公示结果</h1><p class="muted">本页为独立结果页；行政区和成交日期已用于列表查询，其余接口未支持的条件再读取候选详情复核。</p>
<section class="card"><div class="stats"><div class="stat"><strong>{summary.get("fetched", 0)}</strong><span>条件候选</span></div><div class="stat"><strong>{len(rows)}</strong><span>详情复核通过</span></div><div class="stat"><strong>{coordinate_count}</strong><span>可定位</span></div><div class="stat"><strong>{missing_coordinate_count}</strong><span>无坐标</span></div></div>
<p class="muted result-summary">共抓取 {summary.get("fetched", 0)} 条，按当前条件保留 {len(rows)} 条；原始抓取中有坐标 {summary.get("fetchedCoordinateCount", coordinate_count)} 条，地图展示筛选结果中的 {coordinate_count} 条。</p>
<div class="actions" style="margin-top:16px"><a class="button" href="{_table_cell(excel_name)}" download>下载 Excel</a><a class="button secondary" href="{_table_cell(excel_name)}" target="_blank" rel="noopener">打开 Excel</a></div></section>
{empty_notice}{warning_block}<section class="card"><h2>地图（{coordinate_count} 条可定位结果）</h2>{map_block}<p class="muted">地图仅展示符合筛选条件且返回 resourceCoordinate.center 的记录；无坐标记录保留在下方明细中。</p></section>
<section class="card"><h2>成交公示明细</h2><div class="table-wrap"><table><thead><tr>{header}</tr></thead><tbody>{body}</tbody></table></div></section>
</main></body></html>"""
    path.write_text(html_content, encoding="utf-8")


def _move_asset(source: Path, target: Path) -> None:
    if not source.exists() or source.stat().st_size <= 0:
        raise ValueError(f"LAND_OUTPUT_EMPTY:{source.name}")
    os.replace(source, target)


def execute_request(
    request: Dict[str, Any],
    fetcher: Callable[..., List[Dict[str, Any]]] = skill_fetch_records,
    detail_fetcher: Callable[[str], Dict[str, Any]] = fetch_resource_detail,
    progress: Callable[..., None] = emit_progress,
) -> Dict[str, Any]:
    config = validate_request(request)
    output_dir = Path(config["outputDirectory"])
    job_id = f"{dt.datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
    stem = f"浙江土地成交公示_{job_id}"
    final_paths = {
        "excel": output_dir / f"{stem}.xlsx",
        "html": output_dir / f"{stem}.html",
        "coords": output_dir / f"{stem}_coords.json",
        "points": output_dir / f"{stem}_points.js",
        "map": output_dir / f"{stem}_map.html",
    }
    stage = Path(tempfile.mkdtemp(prefix=".tianyuan-land-", dir=output_dir))
    try:
        progress("fetching", 5, "正在按条件读取浙江土地成交公示候选列表", fetched=0, filtered=0, written=0)
        list_filter = _list_district_filter(config)
        records = fetcher(
            district_filter=list_filter,
            max_pages=config["maxPages"],
            record_filter=lambda record: _list_record_matches_request(config, record),
            stop_before=_list_stop_before(config),
            server_filters=_list_server_filters(config),
        )
        fetched_count = len(records)
        progress("fetching", 38, f"条件候选读取完成，共 {fetched_count} 条，正在复核详情", fetched=fetched_count, filtered=0, written=0)
        enriched: List[Dict[str, Any]] = []
        for index, record in enumerate(records, 1):
            enriched.append(enrich_record(record, detail_fetcher))
            percent = 40 + round(index / max(1, fetched_count) * 28)
            progress("enriching", percent, f"正在读取详情 {index}/{fetched_count}", fetched=fetched_count, enriched=index, filtered=0, written=0)
        filtered, filter_summary = filter_records(enriched, config)
        fetched_coordinate_count = sum(
            1 for item in enriched
            if item.get("coord", {}).get("center", {}).get("lng") not in (None, "")
            and item.get("coord", {}).get("center", {}).get("lat") not in (None, "")
        )
        filtered_coordinate_count = sum(
            1 for item in filtered
            if item.get("coord", {}).get("center", {}).get("lng") not in (None, "")
            and item.get("coord", {}).get("center", {}).get("lat") not in (None, "")
        )
        summary = {
            "fetched": fetched_count,
            "enriched": len(enriched),
            "filtered": len(filtered),
            "written": len(filtered),
            "fetchedCoordinateCount": fetched_coordinate_count,
            "filteredCoordinateCount": filtered_coordinate_count,
            **filter_summary,
        }
        progress("filtering", 72, f"候选详情复核完成，保留 {len(filtered)} 条", fetched=fetched_count, filtered=len(filtered), written=0)

        stage_xlsx = stage / "result.xlsx"
        coord_stage = stage / "result_coords.json"
        points_stage = stage / "result_points.js"
        map_stage = stage / "result_map.html"
        rows_without_assets = [row_from_item(item) for item in filtered]
        if config["generateMap"]:
            map_rows = []
            for item in filtered:
                record = item["record"]
                map_rows.append({
                    "sourceCode": record.get("sourceCode", ""),
                    "districtName": record.get("districtName", ""),
                    "releaseTime": record.get("releaseTime", ""),
                    "_detail_url": item["detail_url"],
                    "_location": item["location"],
                    "_area_mu": item["area_mu"] if item["area_mu"] is not None else "",
                    "_use": item["land_use"],
                    "_start_unit_price": item["start_price"] if item["start_price"] is not None else "",
                    "_start_total_price_wan": item["start_total_price"],
                    "_deal_unit_price": item["deal_price"] if item["deal_price"] is not None else "",
                    "_deal_total_price_wan": item["deal_total_price"],
                    "_assignment_area_sqm": item["area_sqm"] if item["area_sqm"] is not None else "",
                    "_coord": item["coord"],
                })
            assets = build_map_assets(map_rows, stage_xlsx)
            stage_coord = Path(assets["coord_json"])
            stage_points = Path(assets["points_js"])
            stage_map = Path(assets["map_html"])
            coord_stage = stage_coord
            points_stage = stage_points
            map_stage = stage_map
            for item, row in zip(filtered, rows_without_assets):
                row["坐标数据文件"] = str(final_paths["coords"])
                row["地图文件"] = str(final_paths["map"])
        write_excel(stage_xlsx, rows_without_assets, config, summary)
        progress("writing", 86, "Excel 已生成，正在校验结果页和地图产物", fetched=fetched_count, filtered=len(filtered), written=0)

        if config["generateMap"]:
            map_text = map_stage.read_text(encoding="utf-8")
            map_text = map_text.replace(points_stage.name, final_paths["points"].name)
            map_stage.write_text(map_text, encoding="utf-8")
            _move_asset(coord_stage, final_paths["coords"])
            _move_asset(points_stage, final_paths["points"])
            _move_asset(map_stage, final_paths["map"])
        else:
            for path in (final_paths["coords"], final_paths["points"], final_paths["map"]):
                if path.exists():
                    path.unlink()

        map_name = final_paths["map"].name if config["generateMap"] else ""
        write_result_html(
            stage / "result.html",
            rows_without_assets,
            config,
            summary,
            {"excel": final_paths["excel"].name, "map": map_name},
        )
        _move_asset(stage_xlsx, final_paths["excel"])
        _move_asset(stage / "result.html", final_paths["html"])
        for path in (final_paths["excel"], final_paths["html"]):
            if not path.exists() or path.stat().st_size <= 0:
                raise ValueError(f"LAND_OUTPUT_READBACK_FAILED:{path.name}")
        progress("complete", 100, f"已写出 {len(filtered)} 条，Excel/结果页回读通过", fetched=fetched_count, filtered=len(filtered), written=len(filtered))
        return {
            "ok": True,
            "action": "run_land_publicity",
            "phase": "completed",
            "percent": 100,
            "fetchedCount": fetched_count,
            "filteredCount": len(filtered),
            "writtenCount": len(filtered),
            "excelPath": str(final_paths["excel"]),
            "htmlPath": str(final_paths["html"]),
            "coordsPath": str(final_paths["coords"]) if config["generateMap"] else "",
            "pointsJsPath": str(final_paths["points"]) if config["generateMap"] else "",
            "mapPath": str(final_paths["map"]) if config["generateMap"] else "",
            "fetchedCoordinateCount": fetched_coordinate_count,
            "filteredCoordinateCount": filtered_coordinate_count,
            "noCoordinateCount": len(filtered) - filtered_coordinate_count,
            "filterSummary": summary,
            "security": {"credentialsReturned": False},
        }
    finally:
        shutil.rmtree(stage, ignore_errors=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="运行浙江土地成交公示受控抓取")
    parser.add_argument("--request-json", required=True)
    args = parser.parse_args()
    try:
        request = json.loads(args.request_json)
        result = execute_request(request)
    except Exception as error:
        result = {
            "ok": False,
            "action": "run_land_publicity",
            "phase": "failed",
            "percent": 0,
            "reason": str(error)[:500],
            "security": {"credentialsReturned": False},
        }
    emit_result(result)
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
