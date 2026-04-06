import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import '../app_config.dart';

enum LiveConnectionStatus {
  disconnected,
  connecting,
  connected,
  degraded,
}

class LiveConnectionState {
  const LiveConnectionState({
    required this.status,
    required this.retryCount,
    this.lastEventAt,
  });

  const LiveConnectionState.initial()
      : status = LiveConnectionStatus.disconnected,
        retryCount = 0,
        lastEventAt = null;

  final LiveConnectionStatus status;
  final int retryCount;
  final DateTime? lastEventAt;

  LiveConnectionState copyWith({
    LiveConnectionStatus? status,
    int? retryCount,
    DateTime? lastEventAt,
  }) {
    return LiveConnectionState(
      status: status ?? this.status,
      retryCount: retryCount ?? this.retryCount,
      lastEventAt: lastEventAt ?? this.lastEventAt,
    );
  }
}

final liveRefreshTickProvider = StateProvider<int>((ref) => 0);

class LiveConnectionController extends Notifier<LiveConnectionState> {
  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _subscription;
  Timer? _retryTimer;
  String? _token;

  @override
  LiveConnectionState build() {
    ref.onDispose(() {
      _retryTimer?.cancel();
      _subscription?.cancel();
      _channel?.sink.close();
    });
    return const LiveConnectionState.initial();
  }

  void start(String token) {
    if (_token == token && state.status == LiveConnectionStatus.connected) {
      return;
    }
    _token = token;
    _connect(resetRetry: true);
  }

  void stop() {
    _token = null;
    _retryTimer?.cancel();
    _subscription?.cancel();
    _channel?.sink.close();
    _channel = null;
    state = const LiveConnectionState.initial();
  }

  void _connect({required bool resetRetry}) {
    final token = _token;
    if (token == null || token.isEmpty) {
      return;
    }

    _retryTimer?.cancel();
    _subscription?.cancel();
    _channel?.sink.close();

    if (resetRetry) {
      state = const LiveConnectionState(
        status: LiveConnectionStatus.connecting,
        retryCount: 0,
      );
    } else {
      state = state.copyWith(status: LiveConnectionStatus.connecting);
    }

    final uri = Uri.parse(AppConfig.websocketUrl)
        .replace(queryParameters: {'access_token': token});
    final channel = WebSocketChannel.connect(uri);
    _channel = channel;

    _subscription = channel.stream.listen(
      (message) {
        final decoded = _decodeEvent(message);
        final eventName = decoded['event']?.toString() ?? '';
        state = state.copyWith(
          status: LiveConnectionStatus.connected,
          retryCount: 0,
          lastEventAt: DateTime.now(),
        );
        if (eventName != 'heartbeat') {
          ref.read(liveRefreshTickProvider.notifier).state++;
        }
      },
      onError: (_) => _scheduleReconnect(),
      onDone: _scheduleReconnect,
      cancelOnError: true,
    );
  }

  Map<String, dynamic> _decodeEvent(dynamic message) {
    if (message is String && message.isNotEmpty) {
      final decoded = jsonDecode(message);
      if (decoded is Map<String, dynamic>) {
        return decoded;
      }
    }
    return const {};
  }

  void _scheduleReconnect() {
    if (_token == null) {
      return;
    }
    final nextRetry = state.retryCount + 1;
    final seconds = nextRetry > 5 ? 15 : nextRetry * 2;
    state = state.copyWith(
      status: LiveConnectionStatus.degraded,
      retryCount: nextRetry,
    );
    _retryTimer?.cancel();
    _retryTimer = Timer(Duration(seconds: seconds), () {
      _connect(resetRetry: false);
    });
  }
}

final liveConnectionProvider =
    NotifierProvider<LiveConnectionController, LiveConnectionState>(
  LiveConnectionController.new,
);
