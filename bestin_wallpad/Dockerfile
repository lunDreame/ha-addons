FROM node:20-slim

ENV LANG C.UTF-8

COPY package.json /
RUN npm install --production
COPY *.js run.sh /
RUN chmod a+x /run.sh

WORKDIR /share

CMD ["/run.sh"]
