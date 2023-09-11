FROM python:3

ENV LANG C.UTF-8

COPY run.sh smart_blind.py /

RUN pip install requests paho-mqtt

WORKDIR /share

RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
