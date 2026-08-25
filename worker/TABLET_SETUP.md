# 태블릿 셋업

worker를 돌릴 안드로이드 태블릿을 준비하는 절차다. 사람이 한 번 해두는 작업이며,
코드가 어떤 상태를 전제하는지는 [README.md](./README.md)의 "태블릿 전제"에 있다.

## 무선 디버깅 연결

케이블 접촉 불량으로 기기가 사라지면 job은 곧바로 `needs_manual_review`로 실패하므로
무선을 권장한다.

```bash
adb pair <태블릿IP>:<페어링포트>     # 태블릿의 페어링 팝업에 뜬 6자리 코드 입력
adb connect <태블릿IP>:<디버깅포트>   # 팝업이 아니라 무선 디버깅 메인 화면의 포트
adb devices -l                       # state가 device 여야 한다
```

공유기에서 태블릿 IP를 고정 할당(DHCP 예약)해둔다. IP가 바뀌면 연결이 끊긴다.

## 화면과 전원

```bash
adb shell settings put global stay_on_while_plugged_in 3
```

화면 잠금은 끈다(계약상 무조건 `needsManualReview` 사유다). 충전기는 꽂아둔 채로
둔다 — 빼면 화면 유지가 풀리고, 절전 중 Wi-Fi가 끊기면 안드로이드가 무선 디버깅을
자동으로 꺼버려서 태블릿 화면 없이는 복구할 수 없다.

## 타임존

```bash
adb shell getprop persist.sys.timezone   # Asia/Seoul 이어야 한다
```

앱이 기기 벽시계로 정모 시각을 해석한다. 다르면 화면에는 맞는 값이 찍히는데 실제
정모는 다른 시각에 만들어진다. handler가 시작할 때 확인하고 다르면 실패시킨다.

## 한글 입력 (ADBKeyBoard)

`adb shell input text`는 한글을 넣지 못한다.
[ADBKeyBoard](https://github.com/senzhk/ADBKeyBoard)를 설치하고 활성 IME로 지정한다.

```bash
adb shell ime enable com.android.adbkeyboard/.AdbIME
adb shell ime set com.android.adbkeyboard/.AdbIME
adb shell settings get secure default_input_method   # 위 값이 나와야 한다
```

되돌리면 자동화가 막히므로 이 기기에서는 계속 활성 IME로 둔다.

## 계정 초기 설정

bot 계정으로 소모임 앱에 처음 로그인하면 활동지역 설정 같은 첫 실행 화면이 뜬다.
자동화 대상이 아니므로 사람이 한 번 통과시켜 둬야 한다. `내모임` 탭에 가입한 모임이
바로 보이면 준비가 끝난 것이다.

## 고정 포트

무선 디버깅은 켤 때마다 포트가 바뀌고 Wi-Fi가 끊기면 꺼진다. 한 번 붙은 뒤
아래를 실행하면 `5555`로 고정되고 Wi-Fi가 끊겼다 붙어도 유지된다.

```bash
adb tcpip 5555                    # adbd가 재시작되며 현재 연결이 한 번 끊긴다
adb connect <태블릿IP>:5555
```

이 주소를 `ADB_CONNECT_ADDRESS`에 넣어두면 worker가 알아서 다시 붙는다.

**재부팅하면 `adb tcpip 5555`와 무선 디버깅이 둘 다 풀린다.** 열려 있는 adb 포트가
하나도 남지 않아 태블릿 화면에서 손으로 다시 켜는 것 외에 복구 방법이 없다. 한 번
붙었을 때 아래를 걸어두면 다음 재부팅부터는 손대지 않아도 된다(롬에 따라 두 번째
줄은 권한이 막혀 무시된다).

```bash
adb shell settings put global adb_wifi_enabled 1
adb shell setprop persist.adb.tcp.port 5555
```

## 자동 재연결이 안 될 때

worker는 기기를 찾지 못하면 `ADB_CONNECT_ADDRESS`와 mDNS로 발견한 주소를 차례로
시도한다. mDNS 탐색은 adb가 지원할 때만 동작하므로, 데비안의 `adb 34.0.4-debian`처럼
mDNS가 빠진 빌드에서는 공식 platform-tools를 쓰거나 `ADB_CONNECT_ADDRESS`를 지정한다.

## 선탑재 앱 정리

기기에 따라 중국 소비자용 앱(틱톡·抖音·샤오홍슈 등)이 선탑재돼 있고, 백그라운드에서
권한 팝업이나 화면 분할 오버레이를 띄워 소모임 앱의 포그라운드를 가로챈다. 그러면
job이 `App did not reach the home screen`으로 실패한다.

```bash
adb shell pm list packages -3                    # 서드파티 앱 확인
adb shell pm disable-user --user 0 <package>     # 삭제가 아니라 비활성화라 되돌릴 수 있다
```
