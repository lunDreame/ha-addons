from threading import Timer
import paho.mqtt.client as paho_mqtt
import requests
import json
import ssl
import logging
import time


options = json.load(open('/data/options.json'))

state_url = 'http://{}:20318/lstinfo'
action_url = 'http://{}:20318/action'

command = {
    'OPEN': ['TU', 'SU'],
    'CLOSE': ['BD', 'SD'],
    'SAVETOP': 'ST',
    'SAVEBOTTOM': 'SB',
    'SAVEM1': 'SM1',
    'SAVEM2': 'SM2',
    'SAVEM3': 'SM3'
}

device = {
    'ids': 'easyroll_{}',
    'name': 'Smart Blinds',
    'mf': 'INOshade (easyroll)',
    'mdl': '{}',
    'sw': '{}',
}

payload = [
    {
        'key': 'blind',
        'init': 'cover',
        '~': 'easyroll/{}',
        'name': 'Inoshade {}',
        'cmd_t': '~/general/command',
        'stat_t': '~/lstinfo/state',
        'val_tpl': '{{ value_json.general }}',
        'pos_t': '~/lstinfo/state',
        'pos_tpl': '{{ value_json.level }}',
        'set_pos_t': '~/level/command',
        'pos_open': 0,
        'pos_clsd': 100,
        'dev_cla': 'blind',
    },
    {
        'key': 'step',
        'init': 'cover',
        '~': 'easyroll/{}',
        'name': 'Inoshade {} Step',
        'cmd_t': '~/general_step/command',
        'dev_cla': 'blind',
    },
    {
        'key': '{}',
        'for': ['Memory1', 'Memory2', 'Memory3'],
        'init': 'button',
        '~': 'easyroll/{}/general_{}',
        'name': 'Inoshade {} {}',
        'cmd_t': '~/command',
    },
    {
        'key': 'save_{}',
        'for': ['Top', 'Bottom', 'M1', 'M2', 'M3'],
        'init': 'button',
        '~': 'easyroll/{}/save_{}',
        'name': 'Inoshade {} Save {}',
        'cmd_t': '~/command',
    }
]


logger = logging.getLogger()
mqtt = paho_mqtt.Client()

mqtt_connected = False
mqtt_previous_state = {}
mqtt_state_dict = None

_timer = {'rt1': '', 'rt2': ''}

class RepeatedTimer(object):
    def __init__(self, interval, early, function, *args, **kwargs):
        self._timer = None
        self.interval = interval
        self.function = function
        self.args = args
        self.kwargs = kwargs
        self.is_running = False
        self.start()
        if early:
            self.early()

    def _run(self):
        self.is_running = False
        self.start()
        self.function(*self.args, **self.kwargs)

    def early(self):
        self.function(*self.args, **self.kwargs)

    def start(self):
        if not self.is_running:
            self._timer = Timer(self.interval, self._run)
            self._timer.start()
            self.is_running = True

    def stop(self):
        self._timer.cancel()
        self.is_running = False


def addon_version():
    url = "https://raw.githubusercontent.com/iluna8/ha-addons/main/easyroll_blind/config.json"

    try:
        response = requests.get(url)
        response.raise_for_status()

        data = response.json()
        return data["version"]
    except requests.exceptions.RequestException as e:
        logger.error(f'addon_version() error occurred > {e}')
    except KeyError:
        logger.error(
            'addon_version() > JSON data does not contain the "version" key')


def start_mqtt_loop():
    logger.info('Initializing MQTT ...')

    mqtt.on_connect = on_mqtt_connect
    mqtt.on_message = on_mqtt_message
    # mqtt.on_error = on_mqtt_error
    mqtt.on_disconnect = on_mqtt_disconnect

    if options['mqtt']['require_login']:
        mqtt.username_pw_set(
            options['mqtt']['username'], options['mqtt']['password'])

    mqtt.connect(options['mqtt']['server'], options['mqtt']['port'])

    if options['require_certificate']:
        mqtt.tls_set(certfile=options['certfile'], keyfile=options['keyfile'],
                     cert_reqs=ssl.CERT_NONE, tls_version=ssl.PROTOCOL_TLS)

    mqtt.loop_start()

    delay = 1
    while not mqtt_connected:
        logger.info('Waiting MQTT connected ...')
        time.sleep(delay)
        delay = min(delay * 2, 10)


def logger_setup():
    logger.setLevel(logging.INFO)

    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)


def on_mqtt_connect(mqtt, userdata, flags, rc):
    global mqtt_connected

    if rc == 0:
        logger.info('MQTT connect successful!')
        mqtt_connected = True
    else:
        logger.error(
            f'MQTT connection error  rc < {paho_mqtt.connack_string(rc)}')

    topic = 'easyroll/+/+/command'
    mqtt.subscribe(topic, 0)


def on_mqtt_disconnect(mqtt, userdata, rc):
    global mqtt_connected

    logger.warning('MQTT disconnected!  ({rc})')
    mqtt_connected = False


def find_smart_blinds():
    smart_blinds = []
    for id, address in enumerate(options['blind']):
        smart_blind = {
            'id': int(id) + 1,
            'address': str(address),
        }
        smart_blinds.append(smart_blind)
    return smart_blinds


def request_smart_blind_state(url, smart_blind_id, move):
    try:
        response = requests.get(url)
        response.raise_for_status()
        handle_response(response.json(), smart_blind_id, move)
    except requests.exceptions.RequestException as erra:
        logger.error(f'Smart blind  request_smart_blind_state() ex < {error}')


def handle_response(body, smart_blind_id, move):
    global mqtt_previous_state, loop_timer

    if body['result'] != 'success':
        logger.error(
            f'Smart blind ({smart_blind_id})  handle_response() < {body["result"]}')
        return

    smart_blind_state = {
        'serialNumber': body['serial_number'].lower(),
        'index': smart_blind_id,
        'ip': body['local_ip'],
        'position': round(body['position']),
        'isDirection': False
    }

    if len(mqtt_previous_state) == 0:
        logger.info(
            f'Smart blind ({smart_blind_id}) registration! < {body["serial_number"]}::{body["local_ip"]}')
        discover_smart_blind(smart_blind_state)
    elif move is not None:
        logger.info(f'Moving blind  {smart_blind_state["position"]} < {move}')
        smart_blind_state['isDirection'] = True

        if 'STOP' == move or smart_blind_state['position'] == move:
            smart_blind_state['isDirection'] = False
            time.sleep(2)
            _timer['rt2'].stop()
    else:
        logger.info(
            f'Update blind  {mqtt_previous_state["position"]} < {smart_blind_state["position"]} ')

    parse_smart_blind_state(smart_blind_state)

    mqtt_previous_state = smart_blind_state


def send_smart_blind_command(url, data, header, smart_blind_id, target):
    global loop_timer

    try:
        response = requests.post(url, json=data, headers=header)
        response.raise_for_status()

        if response.json()['result'] != 'success':
            logger.error(
                f'Smart blind ({smart_blind_id})  send_smart_blind_command() < {response.json()["result"]}')
            return

        if target is not None:  # MEMORY Command Exception
            _timer['rt2'] = RepeatedTimer(1, True, request_smart_blind_state, url.replace(
                'action', 'lstinfo'), smart_blind_id, target)

    except Exception as error:
        logger.error(f'Request failed!  send_smart_blind_command() > {error}')


def parse_smart_blind_state(smart_blind_state):
    if mqtt_state_dict and smart_blind_state['isDirection']:
        if mqtt_state_dict == 'CLOSE':
            move_direction = 'closing'
        elif mqtt_state_dict == 'OPEN':
            move_direction = 'opening'
        elif mqtt_state_dict == 'STOP':
            move_direction = 'stopped'
    else:
        if smart_blind_state['position'] == 0 or smart_blind_state['position'] < 100:
            move_direction = 'open'
        elif smart_blind_state['position'] == 100:
            move_direction = 'closed'

    if len(mqtt_previous_state) > 0 and mqtt_previous_state['position'] == smart_blind_state['position']:
        return

    update_smart_blind(smart_blind_state, move_direction)


def update_smart_blind(smart_blind, move_direction):
    topic = 'easyroll/{}/lstinfo/state'.format(smart_blind['index'])
    payload = {'general': move_direction, 'level': smart_blind['position']}

    mqtt.publish(topic, json.dumps(payload), retain=True)
    logger.info('Publish to MQTT: {}  {}'.format(topic, payload))


def discover_smart_blind(smart_blind):
    for key in payload:
        if 'for' in key:
            for i in key['for']:
                copy_key = key.copy()

                copy_key['~'] = copy_key['~'].format(
                    smart_blind['index'], i.lower())
                copy_key['name'] = copy_key['name'].format(
                    smart_blind['index'], i)
                copy_key['key'] = copy_key['key'].format(i.lower())

                mqtt_discovery(copy_key, smart_blind)
        else:
            key['~'] = key['~'].format(smart_blind['index'])
            key['name'] = key['name'].format(smart_blind['index'])

            mqtt_discovery(key, smart_blind)


def mqtt_discovery(payload, smart_blind):
    topic = 'homeassistant/{}/inoshade_{}/{}/config'.format(
        payload['init'], smart_blind['serialNumber'], payload['key'])

    device['ids'] = device['ids'].format(smart_blind['serialNumber'])
    device['mdl'] = device['mdl'].format(smart_blind['serialNumber'])
    device['sw'] = device['sw'].format(addon_version())

    payload['uniq_id'] = 'inoshade_{}_{}'.format(
        smart_blind['serialNumber'], payload['key'])
    payload['device'] = device

    logger.info('MQTT discovery initialized: {}'.format(topic))

    for key in ['init', 'key', 'for']:
        if key in payload:
            del payload[key]  # Delete discovery-related keys
    mqtt.publish(topic, json.dumps(payload), retain=True)


def on_mqtt_message(client, userdata, msg):
    global mqtt_state_dict

    topics = msg.topic.split("/")
    payload = msg.payload.decode()

    hosts = find_smart_blinds()
    host_dict = []

    for host in hosts:
        id, address = host['id'], host['address']
        if id == int(topics[1]):
            host_dict.extend([id, action_url.format(address)])
            break

    logger.info(f'Received message: {msg.topic}  {payload}')

    if len(mqtt_previous_state) == 0:
        return

    if topics[2] in ['general', 'general_step', 'level']:
        mqtt_state_dict = payload if topics[2] in ['general', 'general_step'] else (
            'OPEN' if int(payload) < mqtt_previous_state['position'] else 'CLOSE')
        send_smart_blind_command(host_dict[1], {'mode': 'general' if topics[2] == 'general_step' else topics[2], 'command': payload if topics == 'level' else ((command[payload][0] if topics[2] == 'general' else command[payload][1]) if payload in ['OPEN', 'CLOSE'] else 'SS')}, {
            'content-type': 'application/json'}, host_dict[0], payload if topics[2] == 'level' else ((0 if payload == 'OPEN' else 100) if payload in ['OPEN', 'CLOSE'] else 'STOP'))
    else:  # Button
        send_smart_blind_command(host_dict[1], {'mode': topics[2].split('_')[0], 'command': topics[2].split('_')[1].replace('memory', 'M') if topics[2].split('_')[0] == 'general' else command[topics[2].replace('_', '').upper()]}, {
            'content-type': 'application/json'}, host_dict[0], None)


if __name__ == '__main__':
    logger_setup()
    start_mqtt_loop()

    for smart_blind in find_smart_blinds():
        id, address = smart_blind['id'], smart_blind['address']
        if mqtt_connected:
            _timer['rt1'] = RepeatedTimer(
                options['scan_interval'], True, request_smart_blind_state, state_url.format(address), id, None)

    if not mqtt_connected:
        _timer['rt1'].stop()