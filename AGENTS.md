# AGENTS.md instructions for cf-studio

- 回复和写作中不要出现“先给结论”、“稳稳的接住你”、“不是..而是”这类 AI 频繁出现的套话。
- 不要把内部说明放在对外出现的任何 UI 界面上。
- 小范围、低风险改动可以默认直接 commit，例如文档、文案、测试样例、明确的 bug 修复，或基本不会影响运行路径的整理。
- 如果工作区里有明显不相关的改动，只提交本次任务相关文件，保留其他改动不动。
- 做版本更新、打 tag、改 `changelogs/changelogs.json` 或处理桌面更新问题时，必须验证 GitHub Release 已创建且安装包资产已上传；不能只检查 tag、changelog 或本地版本号。
- CFDesk release 最低验收：`gh run view <run-id> --repo makerjackie/cf-desk --json status,conclusion` 为 `completed` / `success`，并且 `gh release view vX.Y.Z --repo makerjackie/cf-desk --json assets,url` 能看到对应版本的 macOS、Windows、Linux 资产；如果 release workflow 因提交信息没有 `--release` 被 skipped，可用 `gh workflow run release.yml --repo makerjackie/cf-desk --ref main` 手动补跑并等待完成。
