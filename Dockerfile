# chunhui2001/debian13:ai-openui
FROM node:24-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM akorn/h2o:latest AS h2o

FROM chunhui2001/debian_13.5:zh-CN
LABEL org.opencontainers.image.title="ai-openui"

### 查看系统版本
# cat /etc/issue
### Linux内核版本
# cat /proc/version
# uname -a
# uname -s
# uname -m
# cat /etc/os-release
# h2o -v

RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        ca-certificates \
        libbrotli1 \
        libssl3t64 \
        libzstd1 \
        zlib1g && \
    rm -rf /var/lib/apt/lists/* && \
    apt-get clean && apt-get autoclean

COPY --from=h2o /usr/local/bin/h2o /usr/local/bin/h2o
COPY --from=h2o /usr/local/share/h2o /usr/local/share/h2o
COPY --from=build /app/dist /var/www/html
COPY docker/h2o.conf.template /usr/local/etc/h2o.conf.template
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/docker-entrypoint.sh

ENV OLLAMA_BASE_URL=http://host.docker.internal:11434

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# docker buildx create --use
# docker run --privileged --rm tonistiigi/binfmt --install all

# docker buildx create --name multi-builder --use
# docker buildx inspect --bootstrap

# 一个是“构建并发布到仓库”
# docker buildx build --platform linux/amd64,linux/arm64 --builder multi-builder -t chunhui2001/debian13:ai-openui -f Dockerfile --push .

# 一个是“构建并加载到本地 Docker”
# docker buildx build --platform linux/arm64 -t chunhui2001/debian13:ai-openui -f Dockerfile --load .
# docker buildx build --platform linux/amd64 -t chunhui2001/debian13:ai-openui -f Dockerfile --load .

# docker run -dit --entrypoint="top" --name ai-openui chunhui2001/debian13:ai-openui
# docker run -dit -p 4173:4173 --add-host=host.docker.internal:host-gateway --name ai-openui chunhui2001/debian13:ai-openui
# docker push chunhui2001/debian13:ai-openui
# docker pull chunhui2001/debian13:ai-openui

EXPOSE 4173
