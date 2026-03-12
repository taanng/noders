# URL 转发服务

[![Docker Pulls](https://img.shields.io/docker/pulls/taanng/url_jump)](https://hub.docker.com/r/taanng/url_jump)
[![Image Size](https://img.shields.io/docker/image-size/taanng/url_jump/latest)](https://hub.docker.com/r/taanng/url_jump)

一个轻量级**url转发**服务，支持基于 UUID 令牌的访问鉴权。  
专为 OpenClash / Clash Meta 设计的**固定订阅地址**方案 —— 上游订阅源随时可换，客户端订阅链接永不变。

---

## 功能特性

- 🔒 **UUID 令牌鉴权** — 请求 URL 中必须包含配置的 UUID，否则返回 `403`
- 🔄 **url转发** — 服务端拉取目标地址内容并透传给客户端，浏览器地址栏 URL 始终不变
- 🔥 **配置热重载** — 直接修改宿主机上的 `config.json`，300ms 内生效，无需重启容器
- 📡 **订阅头透传** — 完整转发 `subscription-userinfo` 等 Clash 专用响应头
- 🩺 **健康检查接口** — `GET /health` 返回当前状态和活跃的目标地址
- 🪶 **零依赖** — 仅使用 Node.js 内置模块

---

## 配置文件

将 JSON 文件挂载到容器的 `/app/config/config.json`（或通过环境变量 `CONFIG_PATH` 自定义路径）：

```json
{
  "category": "e67ba74e-467e-45ac-8479-bb118aa777b3",
  "targetUrl": "https://example.com/your-subscription-url"
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `category` | ✅ | 访问令牌，须出现在请求 URL 路径中 |
| `targetUrl` | ✅ | 上游订阅地址，随时可改，改后无需重启 |

---

## 快速开始

```bash
# 1. 创建配置文件
cat > /opt/url_jump_config.json <<'EOF'
{
  "category": "e67ba74e-467e-45ac-8479-bb118aa777b3",
  "targetUrl": "https://your-actual-subscription-url"
}
EOF

# 2. 启动容器
docker run -d \
  --name url_jump \
  --restart unless-stopped \
  -p 38471:8080 \
  -v /opt/url_jump_config.json:/app/config/config.json:ro \
  taanng/url_jump:latest
```

---

## 使用方法

### 填入 OpenClash / Clash Meta 的订阅地址

```
http://<你的服务器IP>:38471/<category-uuid>
```

示例：
```
http://203.0.113.42:38471/e67ba74e-467e-45ac-8479-bb118aa777b3
```

### 热更换上游订阅源（无需重启）

直接修改配置文件中的 `targetUrl`，服务自动检测并重载：

```bash
# 切换到新的订阅源
jq '.targetUrl = "https://new-source.example.com/sub"' \
  /opt/url_jump_config.json > /tmp/cfg.json && \
  mv /tmp/cfg.json /opt/url_jump_config.json
```

### 健康检查

```bash
curl http://localhost:38471/health
# {"status":"ok","target":"https://...","timestamp":"..."}
```

---

## 响应行为说明

| 场景 | HTTP 状态码 |
|------|-------------|
| 携带正确 category 令牌 | `200`（透传上游响应内容） |
| 令牌缺失或错误 | `403 Forbidden` |
| 上游不可达或超时 | `502 Bad Gateway` |
| 健康检查接口 | `200 OK` |

---

## Docker Compose

```yaml
services:
  url_jump:
    image: taanng/url_jump:latest
    container_name: url_jump
    restart: unless-stopped
    ports:
      - "38471:8080"
    volumes:
      - /opt/url_jump_config.json:/app/config/config.json:ro
```
