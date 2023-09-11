FROM python:3

ENV LANG C.UTF-8

COPY run.sh smart_blind.py /

RUN apt-get update && apt-get -y install jq
RUN python3 -m pip install requests && \
        python3 -m pip install paho-mqtt
        
WORKDIR /share

RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
