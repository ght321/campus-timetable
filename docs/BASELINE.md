# 原工程审计与基线

日期：2026-10-21（Asia/Shanghai）。目标E:\git\campus-timetable包括隐藏项目经再次检查为空，随后直接从 https://github.com/ght321/campus-timetable.git 克隆，没有使用第三方镜像。

分支master；基线提交7bee735cb11dfb4714428ccca54e41a61c03a04a。克隆后git status --short为空。未推送、部署或创建提交。

## 原有功能与问题

已阅读原仓库源码、配置、依赖和README。业务仅src/App.tsx，样式App.css/index.css，入口main.tsx；其余是TypeScript/Vite/Oxlint配置、锁文件、静态图标/模板图片。没有AGENTS.md、后端、测试或业务文档。

模型为id:number、name/teacher/room/weeks/color:string、day/start/end:number。8条内置示例课程；weeks如“1-16周”，靠字符串拆分筛选。全部数据、日期、统计和UI在App中。

已支持周切换、详情、三项统计和旧版JSON下载。周状态固定从7开始，日期用今天所在周加(week-7)*7天推算；总周数20、每天10节及钟点表固定。没有CRUD、学期配置、单双周、持久化、冲突、导入和输入校验。

旧导出精确结构为{school:"南京理工大学",week,courses:initialCourses}。没有schemaVersion或开学日期。本次兼容转换依据此源码，而非猜测。

## 开发前实际执行

| 命令          | 原始结果                                                   |
| ------------- | ---------------------------------------------------------- |
| npm ci        | PASS：安装27个包，审计28个包，0漏洞                        |
| npm run build | PASS：tsc -b与Vite 8.3.4，17个模块                         |
| npm run lint  | 完成但有1条react(purity)警告，App.tsx:34在渲染中new Date() |
| 原有测试      | NOT_AVAILABLE：没有测试框架或脚本                          |

原始JS 226.60kB/gzip 71.09kB，CSS 6.80kB/gzip 2.20kB。以上为开发前现场结果，不用修改后的构建冒充基线。

## 复用判断

保留品牌、蓝紫色调、渐变、卡片、CSS Grid和横向滚动思路及8条演示数据。继续使用React入口与Vite构建。拆出模型、业务算法、服务、hook和UI；旧weeks字符串仅在导入边界转换，不作为新业务数据。取消没有校历依据的固定第7周与钟点假设。
