# Home Assistant Add-on: EasyRoll Smart Blind

## Installation

Follow these steps to get the add-on installed on your system:

1. Navigate in your Home Assistant frontend to **Settings** -> **Add-ons** -> **Add-on store**.
2. Find the "EasyRoll Smart Blind" add-on and click it.
3. Click on the "INSTALL" button.

## How to use

The add-on has a couple of options available. To get the add-on running:

1. Start the add-on.
2. Have some patience and wait a couple of minutes.
3. Check the add-on log output to see the result.

## Configuration

Add-on configuration:

```yaml
blind: []
mqtt: []
scan_interval: 900
```

### Option: `mqtt_ssl` (selective)

Enable mqtt ssl security authentication if required. Section *mqtt_ssl_certificate is required.

### Option: `blind` (essential)

Enter addresses for easy roll blinds you want to connect to Type "- 'ip address'" as many blinds as you want

```yaml
blind:
  - 192.168.1.1
  - 192.168.x.x....
  - ....
```

### Option: `mqtt` (essential)

Enter mqtt broker information Required *server *port / username, password is optional and fits your broker information

```yaml
mqtt:
  - server: 192.168.1.1
    port: 1883
    user: user
    passwd: passwd
```

### Option: `mqtt_ssl_certificate` (selective)

Enter the path of mqtt ssl certificates in ca / cert / key. Modify the predefined route according to your environment

```yaml
mqtt_ssl_certificate:
  - ca_path: /share/easyroll_blind/ca.crt
    cert_path: /share/easyroll_blind/client.crt
    key_path: /share/easyroll_blind/client.key
```

### Option: `scan_interval` [unit. minute]
Default value: `900`

Blind query status lookup interval. Gets the blind status every [scan_interval] interval.

## Support

Got questions?

You have several options to get them answered:

- The Home Assistant [NAVER Cafe][forum].

In case you've found a bug, please [open an issue on our GitHub][issue].

* If you experience problems after the add-on update, delete the files in the /share/easyroll folder and try restarting the add-on.
* File Editor File Editor (Directories First = true, Enforce Basepath = false) File Editor

[forum]: https://cafe.naver.com/koreassistant
[issue]: https://github.com/harwin1/ha-addons/issues
[repository]: https://github.com/harwin1/ha-addons
