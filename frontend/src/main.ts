/**
 * 文件：frontend/src/main.ts
 * 功能：前端启动入口，注册 Pinia、路由、Element Plus 与国际化。
 * 交互：挂载 App.vue；初始化 router、stores 与 i18n。
 * 作者：吴川
 */
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import './styles/global.css';
import App from './App.vue';
import { installExperienceRouteSync, router } from './router';
import { i18n } from './i18n';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(ElementPlus);
app.use(i18n);
app.mount('#app');

router.isReady().then(installExperienceRouteSync);
