/**
 * 文件：frontend/src/composables/useWs.ts
 * 功能：管理报价页 WebSocket 订阅、断线重连与轮询降级，维护个人排名状态。
 * 交互：被 SupplierQuoteBidView.vue 调用；连接后端 notification/ws.gateway.ts 与 quote.controller.ts 的 my-rank 接口。
 * 作者：吴川
 */
import { ref, onUnmounted } from 'vue';
import { io, Socket } from 'socket.io-client';
import { api } from './useApi';

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];

export function useWs(lotId: string, supplierId: string) {
  const hasQuote = ref(false);
  const bucket = ref<number | null>(null);
  const myRank = ref<number | null>(null);
  const total = ref<number>(0);
  const isLeading = ref<boolean>(false);
  const connected = ref<boolean>(false);
  let socket: Socket | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectAttempt = 0;
  let stopped = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function fallbackPoll() {
    if (pollTimer || stopped) return;
    void refreshRank();
    pollTimer = setInterval(refreshRank, 7000);
  }

  async function refreshRank() {
    if (stopped) return;
    try {
      const res = await api.get(`/api/quotes/lots/${lotId}/my-rank`);
      if (res.data.success) applyRankData(res.data.data);
    } catch (error: any) {
      if ([401, 403, 404].includes(error.response?.status)) { stopped = true; stopPoll(); socket?.disconnect(); }
    }
  }

  function stopPoll() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  function applyRankData(data: any) {
    hasQuote.value = data.hasQuote ?? data.myRank != null;
    bucket.value = data.bucket ?? null;
    myRank.value = data.myRank ?? null;
    total.value = data.total ?? 0;
    isLeading.value = data.isLeading ?? false;
  }

  function connect() {
    if (stopped) return;
    const token = localStorage.getItem('token');
    socket = io(import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_BASE_URL || '/', {
      path: '/ws',
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });

    socket.on('connect', () => {
      connected.value = true;
      reconnectAttempt = 0;
      stopPoll();
      socket!.emit('subscribe_lot', { lotId });
    });

    socket.on('connect_error', () => { connected.value = false; fallbackPoll(); });
    socket.on('rank_snapshot', applyRankData);
    socket.on('rank_update', (event: any) => {
      if (event.supplierId === supplierId) {
        applyRankData({ myRank: event.rank + 1, total: event.total, isLeading: event.rank === 0 });
      }
    });

    socket.on('ping', () => socket?.emit('pong'));

    socket.on('disconnect', () => {
      connected.value = false;
      if (stopped) return;
      fallbackPoll();
      const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt, RECONNECT_DELAYS.length - 1)];
      reconnectAttempt++;
      reconnectTimer = setTimeout(connect, delay);
    });

    socket.on('error', (err: any) => {
      if (err?.code === 4401 || err?.code === 4403) {
        stopped = true;
        stopPoll();
        if (reconnectTimer) clearTimeout(reconnectTimer);
        // Stop reconnecting after denial.
        socket?.disconnect();
      }
    });
  }

  void refreshRank();
  connect();

  onUnmounted(() => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    socket?.disconnect();
    stopPoll();
  });

  return { refreshRank, hasQuote, bucket, myRank, total, isLeading, connected };
}
