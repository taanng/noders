# 第一阶段，构建应用
FROM node:18-alpine AS build
WORKDIR /app
COPY . .
RUN npm install
RUN npm run  build

#第二阶段，构建镜像
FROM node:18-alpine
WORKDIR /app
COPY --from=build  /app .
# 暴露Nginx的默认端口
EXPOSE 3000

# 定义容器启动命令
CMD ["npm", "run", "start"]
