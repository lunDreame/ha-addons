FROM node:16-alpine

ENV LANG C.UTF-8

COPY easyroll_blind.js run.sh /

RUN npm install mqtt axios simple-node-logger
RUN chmod a+x /run.sh

WORKDIR /share

CMD ["/run.sh"]
