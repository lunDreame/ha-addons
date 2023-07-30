FROM alpine 

ENV LANG C.UTF-8

RUN apk add --no-cache \
    git \
    python \
    make \
    g++
    
RUN npm install mqtt@latest axios@latest simple-node-logger@latest

COPY easyroll_blind.js run.sh /

RUN chmod a+x /run.sh

WORKDIR /share

CMD ["/run.sh"]
