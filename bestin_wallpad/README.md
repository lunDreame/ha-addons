# 업데이트 및 지원 불가

# HDC 베스틴 월패드 RS485 Add-on 

![Supports aarch64 Architecture][aarch64-shield] ![Supports amd64 Architecture][amd64-shield] ![Supports armhf Architecture][armhf-shield] ![Supports armv7 Architecture][armv7-shield] ![Supports i386 Architecture][i386-shield]

# 소개 
* 베스틴 월패드를 사용하는 집에서 사용할 수 있는 애드온입니다. [월패드 버전 1.0, 2.0]
* MQTT discovery를 이용하여, 별도의 yaml 구성없이 본인 집 환경에 따라 디바이스가 추가 됩니다.
* 1.9 버전부터 게이트웨이가 없는 세대도 사용할 수 있습니다.
  * 통신단자함에 별도의 게이트웨이가 없거나 월패드를 열었을 때 여러 가지 랜선이 연결되어 있으면 일체형 버전입니다. 
  
## 지원 목록
* 해당 기기가 월패드에서 조작 및 상태 조회가 가능한 상태여야 합니다.
* 지원 기능
    * 조명
      * 거실 조명 (일체형 버전)
    * 대기전력 차단, 콘센트별 실시간 전력 사용량
    * 난방
    * 환기 (전열교환기)
    * 가스 밸브 (잠금만 가능)
    * 실시간 / 전체 에너지 사용량 (전기, 난방, 수도, 온수, 가스)
       * 일체형 버전 (전기, 수도, 가스)
    * REST API
      - Bestin 1.0
        + 거실 조명
      - Bestin 2.0
        + 거실 조명
        + 엘리베이터 호출 및 알림



# 설치
## 1. 준비 사항
### __Hardware__
#### RS485 연결 장치 
##### EW11 or USB to RS485 **2개**
* Bestin 1.0 
  * 통신단자함 게이트웨이에 아래와 같이 RS485 라인에 연결 (게이트웨이 타입 1)
  * 애드온 포트매핑  ENERGY: energy / CTRL: control
  ![Bestin 1.0의 게이트웨이](./images/gateway_1_.png)

  * 게이트웨이가 아래 사진의 경우. **RS485B**에 EW11 연결 (게이트웨이 타입 2)
  * 애드온 포트매핑  energy
  ![Bestin 1.0 타입2의 게이트웨이](./images/gateway_1_2.png)



* Bestin 1.0 일체형
  * 월패드 후면 CTRL 랜선을 브릿지 하여 브릿지 한 랜선 중 흰주/주, 흰파/파 EW11 각각 연결 (환경에 따라 다른 속선 이거나 랜선일 수 있음)
  * 애드온 포트매핑  흰주/주: energy / 흰파/파: control
  ![Bestin 1.0 일체형의 게이트웨이](./images/gateway_1_1.png)



* Bestin 2.0
  * 아래와 같이 포트가 나눠져 있는 경우, 에너지컨트롤러 1개, 미세먼지 포트 1개에 랜선 연결 (Lan 선을 잘라서 흰파/파 EW11에 연결)
  * 애드온 포트매핑  에너지컨트롤러: energy / 미세먼지: control
  ![Bestin 2.0의 게이트웨이](./images/gateway_2_.png)
  ![Bestin 2.0의 게이트웨이](./images/gateway_2_port_conn.png)



* 연결 성공 시, Packet 정보 확인
  * **02**로 시작하는 Packet이 확인되면 **성공**, **BF**로 시작하거나 이상한 Packet이 나온다면 RX/TX **반대**로 체결

***
### __Software__
#### 아이파크 단지 서버 연동
* 아이파크 조명은 릴레이 방식으로 처리됩니다. 그런 이유로 RS485 패킷으로 거실 조명 제어는 불가능합니다. 아이파크 단지 서버를 연동하여 부가적인 기능들을 지원합니다.
* 일체형 세대의 경우 거실 조명이 RS485로 처리되는 걸 확인하였습니다. 환경에 따라 다를 수 있습니다. 이 경우 서버 기능을 활용하세요.
#### __Bestin 1.0__
  1. http://www.i-parklife.com 위 주소에서 본인 단지가 있어야 서버 연동이 가능합니다.
  2. 단지 서버 가입이 안 되어 있으신 입주민은 먼저 본인 단지 서버 IP로 들어가 회원가입을 하신 후 관리사무소에 연락하여 아이디 승인 요청을 받아야 합니다.

#### __Bestin 2.0__
  1. 월패드에서 모바일기기 등록을 누릅니다.
  2. [Google Colab](https://colab.research.google.com/drive/179PCxJUr2HU07SzkSt-z-JTqMbHT1Smv?hl=ko)에 접속합니다.
  3. 위 페이지에는 총 3개의 실행 버튼이 좌측에 표시됩니다.
  4. 월패드의 등록 창이 활성화된 상태에서 첫 번째 버튼을 누릅니다. (UUID는 고유 ID로, 원하는 걸로 변경하세요)
  5. 월패드에서 6자리 인증 번호가 출력되고, 위 페이지에는 코드가 출력됩니다.
  6. 출력된 코드를 transaction에 입력하고, 월패드의 인증 번호를 password에 입력합니다.
  7. 두 번째 버튼을 누릅니다.
  8. 마지막으로 세 번째 버튼을 누르면 등록이 성공합니다.
  9. 월패드에서 관리자모드에 진입하여 IP Address를 확인합니다. (10.x.x.x 로 보통 시작합니다)
  <pre><code>
  월패드 관리자모드
  진입방법 : 설정 5초 누르기
  70375968 or 73075968
  설정페이지 : 5968
  </code></pre>

***
### HomeAssistant

* Mosquitto broker 설치
    1. 홈어시스턴트의 Supervisor --> Add-on store에서 Mosquitto broker 선택합니다.
    2. 설치하기를 누른 후 생기는 구성 탭을 누릅니다.
    3. logins: []에 원하는 아이디와 비밀번호를 아래와 같은 형식으로 입력합니다. 저장하기를 누르면 자동으로 세 줄로 분리됩니다.
        * logins: [{username: 아이디, password: 비밀번호}]
    5. 정보 탭으로 돌아와 시작하기를 누릅니다.
* MQTT Integration 설치
    1. 홈어시스턴트의 구성하기 --> 통합 구성요소에서 우하단 추가( + )를 누른 후 MQTT를 검색하여 선택합니다.
    2. "브로커"에 HA의 IP 주소 입력, "사용자 이름"과 "비밀번호"에 위 Mosquitto의 로그인 정보 입력, "기기 검색 활성화" 후 확인을 누릅니다.
***
### 애드온 설치, 실행

1. 홈어시스턴트의 Supervisor --> Add-on store에서 우상단 메뉴( ⋮ )를 누른 후 "repositories" 선택합니다.
2. "Add repository" 영역에 위 주소를 입력한 후 추가하기 버튼을 누릅니다. (https://github.com/iluna8/ha-addons)
3. homeassistant 재부팅 한 후 애드온 스토어 하단에 나타난 "HDC BESTIN WallPad RS485 Addon" 을 선택합니다.
4. "INSTALL" 버튼을 누른 후 "START" 가 나타날 때까지 기다립니다. (수 분 이상 걸릴 수 있습니다)
    1. 설치 중 오류가 발생하면 Supervisor -> System의 System log 최하단을 확인해 봐야 합니다.
5. "START" 가 보이면, 시작하기 전에 "Configuration" 페이지에서 아래 설정을 구성 후 "SAVE"를 누릅니다.
    1. server_enable: true / false
    2. 1번 항목을 true로 설정했다면 "server_type" 선택 후, "server"에서 적절한 정보를 입력해 주세요.
    3. mqtt: "Mosquitto broker"의 정보에 맞게 입력해 주세요. 로그인을 활성화했으면 애드온의 username / password를 입력해주세요.
    4. energy / control 항목에서 "type" (serial, socket) 설정 후 각 디바이스에 대한 정보를 적어주세요.
    4-1. Bestin 1.0 게이트웨이 타입 2 경우에는 energy만 사용하여 디바이스 정보를 입력하세요.
6. "Info" 페이지로 돌아와서 "START"로 시작합니다.
    1. 첫 시작 시 회전 애니메이션이 사라질 때까지 기다려주세요.
7. "Log" 페이지에서 정상 동작하는지 확인합니다.
***
### MQTT 통합 구성요소 설정

* MQTT discovery를 지원하므로, 별도의 yaml 파일을 구성하지 않아도 됩니다.
* 통합 구성요소 페이지에 MQTT가 있고, [ ⋮ ]를 클릭했을 때 "새로 추가된 구성요소를 활성화" 되어 있어야 합니다.
* MQTT 통합 구성요소에 "bestin_wallpad" 기기가 생성되고 모든 엔티티가 등록됩니다.
***
# 설정

### `server_enable`:
* 단지 서버 연동 기능을 활성화/ 비활성화합니다. true로 설정할 경우 Bestin 1.0, 2.0에 맞는 정보가 필요합니다.

### `server_type`
* 사용하는 server type을 고릅니다. [v1 = 1.0, v2 = 2.0]

### `smart_lighting`
* 디밍 조명 세대의 경우 활성화합니다.

### `energy / control`
* about
  * energy 또는 control 하나만 연결하는 경우에는 애드온 구성 serial, socket 경우 path, address를 ""로 성정 (기본값으로 설정되어 있음)
  * single_comm 활성화 시 **energy**만 사용하세요.
* type
  * socket (EW11을 이용하는 경우)
  * serial (USB to RS485 혹은 TTL to RS485를 이용하는 경우)
* path (serial인 경우만 변경)
  * Supervisor -> System -> HARDWARE 버튼을 눌러 serial에 적혀있는 장치 이름을 확인해서 적어주세요.
  * USB to RS485를 쓰신다면 /dev/ttyUSB0, TTL to RS485를 쓰신다면 /dev/ttyAMA0 일 가능성이 높습니다.
  * 단, 윈도우 환경이면 COM6 과 같은 형태의 이름을 가지고 있습니다.
* address / port (socket인 경우만 변경)
  * EW11의 address와 port 입력

### `server`
* scan_interval
  * 서버에서 상태 정보를 가져오는 주기 (단위 second)
  * 0으로 설정하면 서버 상태를 업데이트하지 않습니다.
  #### __Bestin 1.0__
  * username / password
    * i-parklife의 id/passwd 입력해 주세요.
  #### __Bestin 2.0__
  * address
    * 월패드의 IP 입력해 주세요.
  * uuid
    * 사전에 등록한 고유 UUID 입력해 주세요.

### `mqtt`
* broker
  * MQTT broker (Mosquitto)의 IP를 적어주세요. 일반적으로 HA가 돌고 있는 서버의 IP와 같습니다.
* port (기본값: 1883)
  * Mosquitto의 포트 번호를 변경하셨다면 변경한 포트 번호를 적어주세요.
* username, password
  * Mosquitto의 아이디와 비밀번호를 적어주세요.
* prefix
  * MQTT topic의 시작 단어를 변경합니다. 기본값으로 두시면 됩니다.
* discovery (true / false)
  * false로 변경하면 HA에 장치를 자동으로 등록하지 않습니다. 직접 yaml파일 구성이 필요합니다.

### `rs485`
* max_retry (기본값: 20)
  * 실행한 명령에 대해서 성공 응답을 받지 못했을 경우 재 명령을 시도할 횟수입니다.
* single_comm (기본값: false)
  * 단일 통신을 활성화할지 비활성화할지 정의합니다. 월패드 통신을 단일 포트로 할 시 true로 설정합니다. Bestin 1.0 게이트웨이 타입 2의 경우
  * true로 설정 시 애드온 구성 energy에 적어주세요.
    
### `log`
* file
  * true로 설정되어 있으면, '/share/bestin/logs' 경로에 YYYY-MM-DD.log 파일로 저장됩니다. 하루마다 갱신되며 최대 7일 치를 저장합니다.
* level
  * log를 저장하는 로그 레벨을 선택합니다. [silly, info, error, warn]
  * silly: 모든 로그 레벨을 표시합니다.
  * [info/error/warn]: 해당 로그 레벨만 표시합니다.

***
## 지원
* Bestin 2.0 디밍 지원세대의 경우 이 애드온이 완벽하게 동작하지 않습니다. 에너지 컨트롤러 부분에서 
  문제가 발생하고 있으며 추가적인 확인이 필요합니다.

* 애드온 업데이트 이후에 문제가 발생한다면 /share/bestin 폴더의 파일들을 삭제 후 애드온 재시작을 시도해 보세요.
* 위 경로에 접근하기 위해서 File editor 애드온을 사용하는 경우 (Directories First = true, Enforce Basepath = false) 구성으로 수정

[HomeAssistant 네이버 카페 (질문, 수정 제안 등)](https://cafe.naver.com/koreassistant)

[Github issue 페이지 (버그 신고, 수정 제안 등)](https://github.com/harwin1/bestin-v1/issues)

*** 
## 기부
* Paypal
  * https://www.paypal.com/paypalme/halwin284?country.x=KR&locale.x=ko_KR
* 카카오톡
  
 ![카카오톡 기부 QR코드](./images/donation_kakao.png)
  * https://qr.kakaopay.com/FWDWOBBmR (모바일에서만 가능)


---

[aarch64-shield]: https://img.shields.io/badge/aarch64-yes-green.svg
[amd64-shield]: https://img.shields.io/badge/amd64-yes-green.svg
[armhf-shield]: https://img.shields.io/badge/armhf-yes-green.svg
[armv7-shield]: https://img.shields.io/badge/armv7-yes-green.svg
[i386-shield]: https://img.shields.io/badge/i386-yes-green.svg
