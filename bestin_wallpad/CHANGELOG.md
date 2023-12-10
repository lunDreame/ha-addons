## 수정 내역

## 1.9
* 게이트웨이가 없는 세대 지원(월패드 일체형)
* Bestin 1.0 게이트웨이 타입별 설정 및 가이드 추가
* 기존 패킷 구분자 정의 방식으로 인해 집마다 다른 패킷 구조를 판별하기 어려움
  이러한 문제를 해결하기 위해 자동으로 구분자를 찾아서 나눔

## 1.8.1
* Energy TimeStamp RangeError fix

## 1.8
* 환기 Preset Mode제거 -> Percentage
* bestin_v2 smartlight 타입 재정의
* 엘리베이터 도착후 상태 업데이트-> 도착/arrived
* HEMS unit 수정/ 난방,온수 총 사용량 업데이트
* HEMS/outlet device_class 추가
* timeStamp로 디바이스 간에 sync 타임을 맞추는 걸로 보아 명령패킷 및 딜레이 시간에 timeStamp 반영
  
## 1.7.3
* CustomParser 클래스 제거
* All 명령 제거
* code refactoring
  
## 1.7.2
* Mqtt Discovery 이름포맷 오류수정
* eletric 오타수정

## 1.7
* Fix a bug

## 1.6.9
* large update 

## 1.6.7
* 커스텀파서, 체크섬, 명령 로직 변경
* energy/control 별도로 분리
* 명령 ack 응답시 로그 변경
* 서버 상태 세부적으로 로그 표시

## 1.6.5
* 에너지 총 사용량 추가(전기, 수도, 가스)
* 서버 세션이 만료된 이후 조명 상태 업데이트 안되는 문제해결

## 1.6.4
* 명령 씹힘 문제 해결

## 1.6.3
* 1.0 서버 조명상태 업데이트 이슈 수정
* 환기: Preset Mode: Nature / Timer(min: 0. max: 240. minute) 추가

## 1.6.1/1.6.2
* 커스텀파서 패킷 튀는경우 예외처리
* 체크섬 및 패킷 핸들러 로직 수정
** 2023-04-28 03:04:04 ERROR: checksum error: 023180aba079efa5f3ff, false
   위와 같은 로그는 체크섬에는 문제가 없습니다, 한번에 많은 스트림이 몰려와 그렇습니다.

### 1.6.0 
* 환기 패킷이 다른 경우 예외처리
* 일괄조명 상태조건 변경(켜져 있는 조명에 따라)
* 커스텀 파서 클래스 새로운 패킷추가

### 1.5.0
* Rest Api(bestin 2.0) 기능 추가 * 지원기기[거실조명, 엘리베이터(본인 집 ip주소 필요)]
* 코드 리팩토링 (파서/명령 함수 재설정 및 Rest APi for bestin 1.0 )

### 1.4.0
* 코드 업데이트 (bestin2.0 지원 추가)

### 1.3.0
* 코드 수정 및 로그 파일 옵션 추가

### 1.2.0
* Dockerfile, run.sh 버그 픽스
* bestin.js config.json 파일 경로 수정

### 1.1.0
* 아이파크 서버 세션 리프레쉬 옵션 추가
* 그외 코드 안정화 및 버그 픽스

### 1.0.0
* bestin.js 코드 공개
