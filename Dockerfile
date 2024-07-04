   # 使用官方的Nginx基础镜像
   FROM nginx:latest

   # 维护者信息（可选）
   LABEL maintainer="your-email@example.com"

   # 将自定义的HTML文件复制到Nginx的默认HTML目录
   #COPY index.html /usr/share/nginx/html/index.html

   # 暴露Nginx的默认端口
   EXPOSE 80
