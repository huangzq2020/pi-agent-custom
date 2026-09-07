import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class StoredConnection {
  const StoredConnection({required this.url, required this.token});

  final String url;
  final String token;
}

class ConnectionStore {
  static const _urlKey = 'gateway_url';
  static const _tokenKey = 'gateway_token';
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  Future<StoredConnection?> read() async {
    final url = await _storage.read(key: _urlKey);
    final token = await _storage.read(key: _tokenKey);
    if (url == null || url.isEmpty) return null;
    return StoredConnection(url: url, token: token ?? '');
  }

  Future<void> write(StoredConnection connection) async {
    await _storage.write(key: _urlKey, value: connection.url);
    await _storage.write(key: _tokenKey, value: connection.token);
  }
}
