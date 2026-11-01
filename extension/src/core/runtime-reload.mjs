export function shouldReloadExtensionForRuntime({ runtimeContract, protocol, activeRuntimeBuildId, attemptedRuntimeBuildId }) {
  const compatibility = protocol?.runtimeCompatibility;
  if (!runtimeContract?.runtimeBuildId || !compatibility?.runtimeBuildId) return false;
  if (runtimeContract.runtimeBuildId !== compatibility.runtimeBuildId) return false;
  if (runtimeContract.extensionVersion !== compatibility.extensionVersion) return false;
  if (runtimeContract.bridgeProtocol !== protocol.protocolVersion) return false;
  if (activeRuntimeBuildId === runtimeContract.runtimeBuildId) return false;
  return attemptedRuntimeBuildId !== runtimeContract.runtimeBuildId;
}
