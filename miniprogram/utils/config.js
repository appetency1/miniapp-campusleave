/**
 * utils/config.js —— 环境配置
 *
 * 开发期：指向本机后端。微信开发者工具里必须勾选
 *        「详情 → 本地设置 → 不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」，
 *        否则 http://localhost 的请求会被拦截。
 * 上线时：改成 https 域名，并在 mp 后台配置 request 合法域名（本项目不真正上架，保持 localhost 即可）。
 */
const BASE_URL = 'http://localhost:8080/api/v1'

/** 文件访问前缀（后端返回的是相对路径 /files/xxx，需要拼上服务地址） */
const FILE_BASE = 'http://localhost:8080'

module.exports = { BASE_URL, FILE_BASE }
