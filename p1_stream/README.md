# Home Assistant Add-on: P1 Stream

Bambu Lab P1 Camera RTSP Stream for Home Assistant.

![Supports aarch64 Architecture][aarch64-shield] ![Supports amd64 Architecture][amd64-shield] 

## About
* This add-on installation streams the chamber camera of the Bambu Lab P1 printer.

* MJPEG Camera is reachable under: http://localhost:1984/api/stream.mjpeg?src=p1
  * it streams the RSTP MJPEG Stream to Port: 8554

* To add the Camera to Home Assistant add a MJPEG IP Camera.

![](https://raw.githubusercontent.com/kurim/p1stream-ha/main/img/p1stream_1.png)

## Configuration
![](https://raw.githubusercontent.com/kurim/p1stream-ha/main/img/p1stream_2.png)

- MJPEG URL: http://localhost:1984/api/stream.mjpeg?src=p1
- Username: p1stream (default)
- Password: p1stream (default)

## Reference
https://github.com/kurim/p1stream-ha


[aarch64-shield]: https://img.shields.io/badge/aarch64-yes-green.svg
[amd64-shield]: https://img.shields.io/badge/amd64-yes-green.svg

