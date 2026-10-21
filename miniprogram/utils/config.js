/**
 * utils/config.js —— 环境配置
 *
 * ⚠️ 真机调试必须用「电脑的局域网 IP」，不能用 localhost：
 *    手机上的 localhost 指的是「手机自己」，不是你的电脑。
 *    开发者工具模拟器用 localhost 可以，真机一定不通。
 *
 * 当前配置（局域网 IP，开发者工具和真机都能用）：
 *    http://10.225.223.179:8080/api/v1
 *
 * 换网络后 IP 会变，用下面任一方式拿到新 IP 再改这里：
 *    Windows：ipconfig → WLAN 的 IPv4 地址
 *    命令行：ipconfig | findstr IPv4
 *
 * 真机调试三件套（缺一不可）：
 *    ① 手机与电脑连同一个 WiFi
 *    ② 开发者工具「详情 → 本地设置 → 不校验合法域名」勾上
 *    ③ 用「真机调试」模式（不是普通预览二维码；普通预览不豁免 http 域名校验）
 *    ④ Windows 防火墙放行 8080 入站（本机已有 java 的允许规则）
 *
 * 正式上线时改成 https 域名，并在 mp 后台配置 request 合法域名。
 */

/** 小程序接口前缀 */
const BASE_URL = 'http://10.225.223.179:8080/api/v1'

/** 文件访问前缀（后端返回的是相对路径 /files/xxx，需要拼上服务地址） */
const FILE_BASE = 'http://10.225.223.179:8080'

/**
 * 演示账号（仅登录页的「演示账号」一键填充用）。
 * 这是 sql/V1.1__seed_demo.sql 里内置的演示数据，不是真实用户凭据；
 * 正式部署时应删掉登录页的填充入口与这两项配置。
 */
const DEMO_ACCOUNT = { username: '2023001001', password: '123456' }

module.exports = { BASE_URL, FILE_BASE, DEMO_ACCOUNT }
