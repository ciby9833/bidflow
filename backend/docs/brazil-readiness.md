# 巴西与多机构支持：实现与验证

> 2026-11-12 业务对照审计修订：以 `business-change-audit-2026-11-12.json` 为本次恢复及验证记录。前端由其他人修改，本次未修改前端；桌面认证税号必填、审核意见必填仍待前端负责人对齐，不能视为端到端全部恢复。

## 当前规则

- 新建 BR 机构默认 BRL、America/Sao_Paulo、pt-BR。巴西不是单一时区，可显式配置 America/Manaus 等有效 IANA 时区。币种接受三位字母代码，不限于五个界面选项；不新增语言白名单。非法 IANA 时区仍拒绝。
- 供应商主体、注册国家、认证状态仍为全局共享；supplier_branch_profiles 控制各机构独立准入。跨境供应商在巴西获准入，不代表注册国家必须为 BR。
- 单机构直接登录；多机构首次选择，后续复用仍有效的上次选择。切换换发会话并回到大厅，避免带入旧机构的详情地址。撤销机构关系后旧会话不能静默降级到其他机构。
- 公司账号按当前机构成员角色授权；总部只读招标/报价，但保留明确指定目标机构的供应商管理。供应商账号不能因 users.role 被错误设置而获得公司权限。
- 税号沿用原有可选文本字段；后端创建、编辑、认证提交和批准不增加 CNPJ 必填、算法校验或唯一性约束。不以国家适配替代业务确认。

## 本次修复

1. 葡语资源覆盖前后端英文词典的全部键及插值变量；语言选择、Element Plus、错误消息、导出、验证码/邀请/撤回/延期邮件纳入 pt-BR。新建报价模板增加葡语标签，历史模板不强制覆盖自定义内容。
2. 币种选项增加 BRL。保留正数、有限数、四位小数及十进制换算校验；取消另定的 100000000000 业务上限，容量边界匹配原有 numeric(20,4)。极大金额下 JavaScript/Redis double 精度风险仍存在，不能用未经确认的额度限制掩盖。汇率服务失败不默认按 1 换算；请求超时 5 秒，沿用轮次锁定汇率。
3. 招标保存创建时的机构时区快照。日期输入按该时区解释，UTC 存储；详情、列表、邮件、导出标明时区。夏令时跳跃及重复时段拒绝模糊输入。没有时区的旧数据回填，未知国家回退 UTC。
4. 附件预览按登录身份、机构、供应商/邀请状态授权；只有已发布且公开可见的招标附件允许匿名读取。前端携带凭据获取 Blob，不把私有链接当作公开地址。提交附件引用时校验上传人或该业务记录已有引用，防止引用别人的对象获得访问权。
5. WebSocket 使用握手凭据并重复核验 JWT、当前机构和参与权限；推送按个人和排名模式生成快照，不广播其他供应商身份。支持鉴权完成前立即订阅的客户端；撤权后断开，不无限重连。
6. 重复 HTTP 测试发现并修复报价编号冲突：编号按机构生成，但原数据库要求全局唯一。现改为机构内唯一、机构非空，编号分配使用事务 advisory lock；整包及线路报价一致。
7. 修复清空 dist 与 TypeScript 增量缓存配合时可能漏输出模块的问题；标准构建关闭增量。Redis 连接增加生命周期清理。

## 数据迁移与本地状态

本次已在本地开发库执行：

- 1713740000035：招标时区快照与回填。
- 1713750000036：原 CNPJ 唯一索引已撤销；新安装此迁移不再创建索引，已执行的环境由 1713810000042 删除索引，不删除或合并供应商。
- 1713760000037：报价机构回填、非空、机构内报价编号唯一。无主或归属不一致数据中止迁移。

第三个迁移的回滚在已有跨机构同号记录时会失败，这是预期保护。上线应先备份、检查存量并执行迁移，再部署后端；本地已运行的旧后端进程需要重启才能载入新代码。

HTTP 测试新增标有 HTTP test 的机构、用户、供应商、招标与报价。结束后停用所建机构、挂起测试用户，保留业务记录便于复核；不删除原有开发数据。测试禁止非本机 PostgreSQL，禁止外发邮件。独立数据库测试仅删除自己随机创建的 test_brazil_* / test_deadline_* schema。

## 可重复验证

在 backend 运行：

```sh
npm run test:brazil
node scripts/test-supplier-multibranch.js
node scripts/test-register-email-mode.js
node scripts/test-deadline-changes.js
npm run check:tenant
```

在 frontend 运行：

```sh
npx playwright install chromium
npm run build
npm run test:e2e
```

验证分层：

- 巴西专项 11 项：配置、词典覆盖、CNPJ、十进制/汇率失败、角色、邀请、邮件时区、WS，以及真实 PostgreSQL 约束/迁移/附件授权。
- 既有供应商多机构 16 项、验证码模式 7 项。
- 真实 PostgreSQL 延期事务脚本：并发、幂等、回滚、轮次、邮件重试和机构隔离。
- 完整 Nest HTTP + PostgreSQL + Redis + Socket.IO：受限登录、巴西默认值、税号可选及可重复、发布、BRL 报价、隐私排名、切换、角色降权、撤权、专员准备下一轮但不能发布。重复运行覆盖不同机构相同报价编号。
- 7 项真实 Chromium UI 测试：总部新建、供应商建档错误保留输入、切换取消/确认、评标员按钮权限、跨时区/DST、390px 移动端及招标布局。UI 测试使用模拟 API，与上述真实后端测试分开，并非浏览器到真实后端的全链路回归。
- 截图位于 frontend/test-results，运行测试自动生成，不提交。

## 真实用户全链路补充验收

本地真实浏览器→Nest→PostgreSQL/Redis/对象存储的 12 组场景已通过（0 失败、0 跳过），覆盖注册认证、多机构切换、BRL 改价、运输线路、多轮历史、权限撤销、手机端和评审导出。发现的交互/幂等/实时排名/跨轮问题已修复并复测。详见 [本地真实用户验收记录](brazil-user-acceptance.md)。

## 仍需上线前确认的边界

- CNPJ 工具函数仅保留为未接入业务的参考实现；运行时不强制校验，也没有接入官方主体查询。
- 这是采购招标与报价系统的巴西适配，不包含巴西税务计算、电子发票、付款/结算、本地行业许可证审核，也不代表 LGPD 合规验收。全球认证和机构独立资质审批仍是不同需求；若要求各机构分别审核当地法定资质，应新增机构级资质模型，不能复用一个全局 approved 状态。
- 用户手工填写的招标内容/自定义模板不会自动翻译；历史页面残留硬编码文案仍需葡语用户验收，词典覆盖不能代替所有页面语言验收。
- 未测试真实 SMTP 投递、生产对象存储/CDN、巴西网络延迟、负载压力；浏览器只覆盖 Chromium，不含 Safari/Firefox。
- 安装依赖时审计报告 backend 45 项、frontend 21 项依赖漏洞（含高危，backend 含 critical），另有 AWS SDK v2 停止维护和前端大包警告。没有执行可能破坏兼容性的 audit fix --force；需要独立依赖升级与安全复测。
- check:tenant 通过仅代表未增加裸仓储注入，仍有既有 23 处基线，不等于所有接口均已完成形式化隔离证明。

## CNPJ 依据

- [Receita Federal：首个字母数字 CNPJ](https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/julho/receita-federal-gera-o-primeiro-cnpj-em-formato-alfanumerico)
- [官方校验位技术手册](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj/manual-dv-cnpj.pdf)
- [ANPD：国际数据传输](https://www.gov.br/anpd/pt-br/assuntos/assuntos-internacionais/transferencia-internacional-de-dados)
