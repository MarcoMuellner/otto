const MODEL_REF_SEPARATOR = "/"

/**
 * Parses provider/model references so runtime can pass explicit provider and model identifiers
 * to OpenCode chat calls.
 *
 * @param value Model reference in provider/model format.
 * @returns Split provider and model identifiers.
 */
export const splitModelRef = (value: string): { providerId: string; modelId: string } => {
  const separatorIndex = value.indexOf(MODEL_REF_SEPARATOR)
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    throw new Error(`OpenCode model must be in provider/model format, received: ${value}`)
  }

  return {
    providerId: value.slice(0, separatorIndex),
    modelId: value.slice(separatorIndex + 1),
  }
}
