FROM node:14-alpine

ENV LANG C.UTF-8

COPY smart_blind.js run.sh package.json /

RUN npm install 
RUN chmod a+x /run.sh

WORKDIR /share

CMD ["/run.sh"]
