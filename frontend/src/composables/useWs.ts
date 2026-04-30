/**
 * 文件：frontend/src/composables/useWs.ts
 * 功能：管理报价页 WebSocket 订阅、断线重连与轮询降级，维护个人排名状态。
 * 交互：被 SupplierQuoteBidView.vue 调用；连接后端 notification/ws.gateway.ts 与 quote.controller.ts 的 my-rank 接口。
 * 作者：吴川
 */
import { ref, onUnmounted } from 'vue';
import { io, Socket } from 'socket.io-client';

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];

export function useWs(lotId: string, supplierId: string) {
  const myRank = ref<number | null>(null);
  const total = ref<number>(0);
  const isLeading = ref<boolean>(false);
  const connected = ref<boolean>(false);
  let socket: Socket | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectAttempt = 0;

  function fallbackPoll() {
    if (pollTimer) return;
    pollTimer = setInterval(async () => {
      try {
        const res = await fetch(`/api/quotes/lots/${lotId}/my-rank`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        const data = await res.json();
        if (data.success) applyRankData(data.data);
      } catch { /* ignore */ }
    }, 7000);
  }

  function stopPoll() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  function applyRankData(data: any) {
    if (data.myRank !== undefined) myRank.value = data.myRank;
    if (data.total !== undefined) total.value = data.total;
    if (data.isLeading !== undefined) isLeading.value = data.isLeading;
  }

  function connect() {
    const token = localStorage.getItem('token');
    socket = io('/', {
      path: '/ws',
      query: { token },
      transports: ['websocket'],
      reconnection: false,
    });

    socket.on('connect', () => {
      connected.value = true;
      reconnectAttempt = 0;
      stopPoll();
      socket!.emit('subscribe_lot', { lotId });
    });

    socket.on('rank_snapshot', applyRankData);
    socket.on('rank_update', (event: any) => {
      if (event.supplierId === supplierId) {
        applyRankData({ myRank: event.rank + 1, total: event.total, isLeading: event.rank === 0 });
      }
    });

    socket.on('ping', () => socket?.emit('pong'));

    socket.on('disconnect', () => {
      connected.value = false;
      fallbackPoll();
      const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt, RECONNECT_DELAYS.length - 1)];
      reconnectAttempt++;
      setTimeout(connect, delay);
    });

    socket.on('error', (err: any) => {
      if (err?.code === 4401 || err?.code === 4403) {
        // Token issue — stop reconnecting, let auth layer handle
        socket?.disconnect();
      }
    });
  }

  connect();

  onUnmounted(() => {
    socket?.disconnect();
    stopPoll();
  });

  return { myRank, total, isLeading, connected };
}
