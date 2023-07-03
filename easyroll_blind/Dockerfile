FROM node:14-alpine

ENV LANG C.UTF-8

COPY easyroll_blind.js run.sh /

RUN npm install mqtt request simple-node-logger
RUN chmod a+x /run.sh

WORKDIR /share

CMD ["/run.sh"]
