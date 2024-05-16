FROM node:20-alpine

ENV LANG C.UTF-8

COPY bestin.js const.js logger.js run.sh /
COPY package.json /

RUN npm install --production && \
    chmod a+x /run.sh

WORKDIR /share

CMD ["/run.sh"]
