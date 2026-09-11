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

**재부팅하면 `adb tcpip 5555`가 풀린다.** 한 번 붙었을 때 아래를 걸어두면 다음
재부팅부터는 손대지 않아도 된다(롬에 따라 두 번째 줄은 권한이 막혀 무시된다 —
`Failed to set property`가 뜨면 그 경우다).

```bash
adb shell settings put global adb_wifi_enabled 1
adb shell setprop persist.adb.tcp.port 5555
```

두 번째 줄이 막혀도 첫 줄이 먹으면 재부팅 뒤 무선 디버깅이 **랜덤 포트로** 다시
뜨고, worker의 포트 스캔이 그 포트를 찾아낸다(아래 "자동 재연결이 안 될 때"). 둘 다
안 되면 열린 adb 포트가 하나도 남지 않아 태블릿 화면에서 손으로 켜는 수밖에 없다.

## 자동 재연결이 안 될 때

worker는 기기를 찾지 못하면 네 단계를 차례로 시도한다.

1. `ADB_CONNECT_ADDRESS`
2. mDNS로 발견한 주소 — adb가 지원할 때만 동작한다. 데비안의 `adb 34.0.4-debian`처럼
   mDNS가 빠진 빌드에서는 건너뛴다(`adb mdns check`가 빈 출력이면 그 빌드다).
3. 기기 IP의 열린 포트 전수 스캔 — **포트만** 바뀐 경우를 위한 것이다.
4. 같은 대역의 호스트 스캔 — **IP가** 바뀐 경우를 위한 것이다.

3단계가 있는 이유는 태블릿 재부팅이다. 재부팅하면 무선 디버깅이 **랜덤 포트로** 다시
뜨는데, `persist.adb.tcp.port`가 막힌 롬에서는 고정 포트가 살아나지 않고 mDNS도 없으면
그 포트를 알아낼 길이 없다. 스캔은 같은 Wi-Fi에서 65535 포트에 4초쯤 걸린다(실측).

4단계는 앞의 셋이 **모두 기기의 IP를 안다고 전제**하기 때문에 있다. DHCP가 다른
주소를 주면 셋 다 빗나간다 — 실제로 재부팅 한 번에 `.147`에서 `.155`로 바뀌어 worker가
사흘 동안 기기를 못 찾은 적이 있다. `ADB_CONNECT_ADDRESS`의 대역(`/24`)에서 같은
포트가 열린 호스트를 훑고, 붙은 뒤 `ro.serialno`가 `ADB_DEVICE_SERIALNO`와 같은
기기만 남긴다. 실측 2초.

**`ADB_DEVICE_SERIALNO`를 비우면 4단계를 건너뛴다.** 시리얼을 모르면 찾아낸 기기가
우리 태블릿인지 확인할 방법이 없고, 대역에 있는 남의 안드로이드에 붙는 편이 못 붙는
것보다 나쁘다. 값은 `adb shell getprop ro.serialno`로 확인한다. 시리얼이 다른 기기는
즉시 `adb disconnect`로 끊어 목록에 남기지 않는다.

세 단계가 모두 실패하면 `DISCORD_AUTOMATION_WEBHOOK_URL`로 알림이 간다. 알림은
상태가 **바뀔 때만** 나간다 — 끊긴 동안 반복해서 오지 않고, 다시 붙으면 끊겨 있던
시간과 함께 복구 알림이 한 번 온다. 확인 간격은 `DEVICE_CHECK_INTERVAL_MS`(기본
10분)이며 job이 없는 동안에만 확인한다. worker가 스스로 다시 붙은 경우에는 알리지
않는다 — 사람을 부르는 것은 자동 복구가 실패했을 때뿐이다.

포트가 바뀌어 붙어도 worker는 같은 IP면 같은 태블릿으로 본다. IP까지 바뀐 경우에는
4단계가 확인한 새 주소를 그 프로세스가 사는 동안 기억해 그것으로 기기를 고른다.
어느 쪽이든 `ADB_SERIAL`을 당장 고칠 필요는 없다 — 다만 새 주소로 갱신해 두면 다음
재연결이 1단계에서 끝나 스캔 시간을 아낀다.

IP가 자꾸 바뀌는 것이 거슬리면 공유기에서 태블릿 MAC에 고정 IP를 묶는 것이 근본
해결이다. 4단계는 그것을 하지 않았을 때의 안전망이다.

## 선탑재 앱 정리

기기에 따라 중국 소비자용 앱(틱톡·抖音·샤오홍슈 등)이 선탑재돼 있고, 백그라운드에서
권한 팝업이나 화면 분할 오버레이를 띄워 소모임 앱의 포그라운드를 가로챈다. 그러면
job이 `App did not reach the home screen`으로 실패한다.

```bash
adb shell pm list packages -3                    # 서드파티 앱 확인
adb shell pm disable-user --user 0 <package>     # 삭제가 아니라 비활성화라 되돌릴 수 있다
```

## worker를 서비스로 등록

worker는 태블릿과 같은 네트워크에 있는 기계에서 돈다. adb가 태블릿의 사설 IP에
직접 닿아야 해서 서버(Railway)에서는 실행할 수 없다. 설정도 그 기계에 둔다 —
서버 환경변수는 worker에 전달되지 않는다. GitHub Actions self-hosted runner나
GitLab Runner와 같은 구조로, 클라우드에는 대조할 공유 비밀만 둔다.

```bash
cp worker/.env.example worker/.env   # INTERNAL_API_KEY는 서버 환경변수와 같은 값
chmod 600 worker/.env                # 비밀이 들어가므로 커밋하지 않는다(gitignore됨)

mkdir -p ~/.config/systemd/user
cp worker/cafestudy-worker.service ~/.config/systemd/user/
# WorkingDirectory와 EnvironmentFile 경로가 이 기계와 맞는지 확인한 뒤:
systemctl --user daemon-reload
systemctl --user enable --now cafestudy-worker
loginctl enable-linger "$USER"       # 로그아웃해도 계속 돌게 한다
```

확인과 로그:

```bash
systemctl --user status cafestudy-worker
journalctl --user -u cafestudy-worker -f
```

락 파일이 worker 두 개가 같은 태블릿을 조작하는 것을 막는다. 손으로 띄운 worker가
떠 있으면 서비스가 뜨지 못하니, 등록 전에 먼저 끈다.
