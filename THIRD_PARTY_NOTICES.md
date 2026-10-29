# 来源与第三方说明

## 上游基础脚本

- 项目：[enro-ff/zhangwodu_Tampermonkey](https://github.com/enro-ff/zhangwodu_Tampermonkey)。
- 本项目使用的文件：上游 `main.js`，用户脚本头部版本 `1.0.3`。
- 固定 Git blob SHA-1：`9ee11ba75fe0e760de4d59e98f31e5f4e5a3c819`。
- 本地保留位置：`vendor/upstream-1.0.3.js`，内容与该 blob 一致。
- 许可依据：上游 [`package.json`](https://github.com/enro-ff/zhangwodu_Tampermonkey/blob/main/package.json) 声明 `"license": "ISC"`，核对日期为 2026-10-29。
- 核对时仓库根目录没有独立 LICENSE 文件，GitHub 仓库元数据的 license 字段为空；这里明确保留 package.json 声明这一来源，不把元数据空值当作已核验的独立许可证文本。

本仓库新增的解析记忆、选中核验、顺序流程、学习页导航及文档沿用 ISC。原项目署名保留，本项目不声称上游原作者为这些修改提供支持或背书。完整许可见 [LICENSE](LICENSE)。

## html2canvas-pro

用户脚本通过 `@require` 从 jsDelivr 加载 `html2canvas-pro@2.5.3`，用于题目截图。此依赖没有复制进本仓库。来源：[npm 项目页](https://www.npmjs.com/package/html2canvas-pro)。第三方代码适用其自身许可。

## jsdom 及测试依赖

`jsdom@30.1.3` 仅用于开发测试；确切依赖树和完整性字段记录在 `package-lock.json`。依赖没有打包进可安装脚本，其许可证以各包自带文件为准。

## 课程平台与题目

本项目与智慧树、任何学校或 AI 服务商没有隶属或官方合作关系。项目许可不授予课程资料、平台商标、他人题库或个人数据的使用权。仓库未分发用户的现成答案库和诊断数据。
