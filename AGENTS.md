# AGENTS.md

AI 助手请先读 [AI_GUIDE.md](AI_GUIDE.md)：课件库结构、如何把新课件 / 题库加入对应课程、如何读取用户的学习记录。

开发本项目（改代码）时：

- 纯 Python 标准库 + PyMuPDF；前端是 `kejian/web/` 下的原生 JS，没有构建步骤。
- 测试：`python -m unittest discover -s tests -v`
- `library/` 是用户的个人课件库（受版权保护），不要提交、不要上传。
