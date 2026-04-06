import 'dart:convert';

Map<String, dynamic> decodeJwtPayload(String token) {
  final segments = token.split('.');
  if (segments.length < 2) {
    return const {};
  }

  final normalized = base64.normalize(segments[1]);
  final decoded = utf8.decode(base64Url.decode(normalized));
  final payload = jsonDecode(decoded);
  return payload is Map<String, dynamic> ? payload : const {};
}
