export function buildGoogleMapsSearchUrl(query?: string | null) {
  const trimmed = query?.trim();
  if (!trimmed) {
    return null;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`;
}

export function buildGoogleMapsDirectionsUrl({
  origin,
  destination,
}: {
  origin?: string | null;
  destination?: string | null;
}) {
  const destinationValue = destination?.trim();
  if (!destinationValue) {
    return null;
  }
  const originValue = origin?.trim();
  const params = new URLSearchParams({
    api: "1",
    destination: destinationValue,
    travelmode: "driving",
  });
  if (originValue) {
    params.set("origin", originValue);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
