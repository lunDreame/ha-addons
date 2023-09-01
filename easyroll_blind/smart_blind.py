import paho.mqtt.client as mqtt
import requests
import json
import ssl
import logging
import time

class SmartBlind:
    def __init__(self):
        self.mqtt_client = self.setup_mqtt_client()
        self.mqtt_connected = False
        self.mqtt_previous_state = {}
        self.mqtt_state_dict = []
                
        self.loop = timer, target, args
        self.thread_[self.loop[1]] = threading.Timer(self.loop[0], self.loop[1], args=self.loop[2])

    def setup_mqtt_client(self):
        mqtt_options = {
            'host': options['mqtt'][0]['server'],
            'port': options['mqtt'][0]['port'],
            'username': options['mqtt'][0].get('user', None),
            'password': options['mqtt'][0].get('passwd', None),
        }
        if options['mqtt_ssl']:
            mqtt_options['protocol'] = 'mqtts'
            mqtt_options['ca_certs'] = options['mqtt_ssl_certificate'][0]['ca_path']
            mqtt_options['certfile'] = options['mqtt_ssl_certificate'][0]['cert_path']
            mqtt_options['keyfile'] = options['mqtt_ssl_certificate'][0]['key_path']
            mqtt_options['tls_version'] = ssl.PROTOCOL_TLSv1_2
            mqtt_options['tls_insecure'] = False

        client = mqtt.Client()
        client.on_connect = self.on_mqtt_connect
        client.on_message = self.on_mqtt_message
        #client.on_error = self.on_mqtt_error
        client.on_disconnect = self.on_mqtt_disconnect

        logger.info('Initializing MQTT...')
        client.connect(**mqtt_options)
        return client

    def on_mqtt_connect(self, mqtt, userdata, flags, rc):
        if rc == 0:
            logger.info('MQTT connect successful!')
            self.loop = options['scan_interval'], request_smart_blind_state, (None)
            
            self.mqtt_connected = True
        else:
            logger.error(f'MQTT connection error  rc < {paho_mqtt.connack_string(rc)}')

        topic = 'easyroll/+/+/+/command'
        mqtt.subscribe(topic, 0)
    
    def on_mqtt_disconnect(self, mqtt, userdata, rc):
        logger.warning('MQTT disconnected!  ({rc})')
        self.mqtt_connected = False
    
    def find_smart_blinds(self):
        smart_blinds = []
        for id, address in options['blind'].items():
            smart_blind = {
                'id': int(id) + 1,
                'address': str(address),
            }
            smart_blinds.append(smart_blind)
        return smart_blinds

    def request_smart_blind_state(self, url, smart_blind_id, move=None):
        try:
            response = requests.get(url)
            response.raise_for_status()
            self.handle_response(response.json(), smart_blind_id, move)
        except Exception as error:
            logger.error(f'Smart blind  request_smart_blind_state() ex: {error}')

    def handle_response(self, body, smart_blind_id, move):
        if body['result'] != 'success':
            logger.error(f'Smart blind ({smart_blind_id})  handle_response() < {body["result"]}')
            return

        smart_blind_state = {
            'serialNumber': body['serial_number'].lower(),
            'index': smart_blind_id,
            'ip': body['local_ip'],
            'position': round(body['position']),
            'isDirection': False
        }
                
        if self.mqtt_previous_state is None:
            logger.info(f'Smart blind ({smart_blind_id}) registration! < {body["serial_number"]}::{body["local_ip"]}')
            self.discover_smart_blind(smart_blind_state)
        elif move is not None:
            logger.info(f'Moving blind  {smart_blind_state["position"]} < {move}')
            smart_blind_state['isDirection'] = True
            
            if smart_blind_state['position'] == move: 
                self.thread_request_smart_blind_state.cancel()
                smart_blind_state['isDirection'] = False
        else:
            logger.info(f'Update blind  {self.mqtt_previous_state["position"]} < {smart_blind_state["position"]} ')

        self.mqtt_previous_state = smart_blind_state

        self.parse_smart_blind_state(smart_blind_state)

    def send_smart_blind_command(self, url, data, header, smart_blind_id, target):
        try:
            response = requests.post(url, json=data, headers=header)
            response.raise_for_status()

            if response.json()['result'] != 'success':
                logger.error(f'Smart blind ({smart_blind_id})  send_smart_blind_command() < {response.json()["result"]}')
                return

            if target:  # MEMORY Command Exception
                time.sleep(0.5)
                self.loop = 1, request_smart_blind_state, (url.replace('action', 'lstinfo'), smart_blind_id, target)

        except Exception as error:
            logger.error(f'Request failed!  send_smart_blind_command() > {error}')

    def parse_smart_blind_state(self, smart_blind_state):
        if self.mqtt_state_dict and smart_blind_state['isDirection']:
            if self.mqtt_state_dict == 'CLOSE':
                move_direction = 'closing'
            elif self.mqtt_state_dict == 'OPEN':
                move_direction = 'opening'
            elif self.mqtt_state_dict == 'STOP':
                move_direction = 'stopped'
        else:
            if smart_blind_state['position'] == 0 or smart_blind_state['position'] < 100:
                move_direction = 'open'
            elif smart_blind_state['position'] == 100:
                move_direction = 'closed'

        self.update_smart_blind(smart_blind_state, move_direction)

    def update_smart_blind(self, smart_blind, move_direction):
        topics = {
            f'easyroll/{smart_blind["index"]}/{smart_blind["serialNumber"]}/direction/state': move_direction,
            f'easyroll/{smart_blind["index"]}/{smart_blind["serialNumber"]}/position/state': str(smart_blind['position']),
        }

        for topic, payload in topics.items():
            self.mqtt_client.publish(topic, payload, retain=True)
            logger.info(f'Publish to MQTT: {topic} = {payload}')

    def discover_smart_blind(self, smart_blind):
        topic = f'homeassistant/cover/easyroll_{smart_blind["index"]}/{smart_blind["serialNumber"]}/config'
        payload = {
            'name': f'easyroll_{smart_blind["serialNumber"]}',
            'cmd_t': f'easyroll/{smart_blind["index"]}/{smart_blind["serialNumber"]}/direction/command',
            'stat_t': f'easyroll/{smart_blind["index"]}/{smart_blind["serialNumber"]}/direction/state',
            'pos_t': f'easyroll/{smart_blind["index"]}/{smart_blind["serialNumber"]}/position/state',
            'set_pos_t': f'easyroll/{smart_blind["index"]}/{smart_blind["serialNumber"]}/position/command',
            'pos_open': 0,
            'pos_clsd': 100,
            'ic': 'mdi:blinds',
            'uniq_id': f'easyroll_{smart_blind["serialNumber"]}',
            'ret': True,
            'device': {
                'ids': 'EasyRoll Smart Blind',
                'name': 'EasyRoll Smart Blind',
                'mf': 'EasyRoll',
                'mdl': 'EasyRoll Inoshade',
                'sw': 'harwin1/ha-addons/easyroll_blind',
            },
        }
        self.mqtt_client.publish(topic, json.dumps(payload))

        for i in range(1, 3):
            topic = f'homeassistant/button/easyroll_{smart_blind["index"]}_mem{i}/{smart_blind["serialNumber"]}/config'
            payload = {
                'name': f'easyroll_{smart_blind["serialNumber"]}_mem{i}',
                'cmd_t': f'easyroll/{smart_blind["index"]}/{smart_blind["serialNumber"]}/mem{i}/command',
                'uniq_id': f'easyroll_{smart_blind["serialNumber"]}_mem{i}',
                'ret': True,
                'ic': 'mdi:alpha-m-box',
                'device': {
                    'ids': 'EasyRoll Smart Blind',
                    'name': 'EasyRoll Smart Blind',
                    'mf': 'EasyRoll',
                    'mdl': 'EasyRoll Inoshade',
                    'sw': 'harwin1/ha-addons/easyroll_blind',
                },
            }
            self.mqtt_client.publish(topic, json.dumps(payload))

    def on_mqtt_message(self, userdata, msg):
        topics = msg.topic.split("/")
        payload = msg.payload.decode()

        hosts = self.find_smart_blinds()
        host_dict = []

        for host in hosts:
            id, address = host['id'], host['address']
            if id == int(topics[1]):
                host_dict.extend([id, ACTION_URL.format(address)])

        logger.info(f'Received message: {msg.topic} = {payload}')

        if topics[3] == 'direction':
            self.mqtt_state_dict = payload
            self.send_smart_blind_command(host_dict[1], {'mode': 'general', 'command': command[payload]}, {'content-type': 'application/json'}, host_dict[0], (0 if payload == 'OPEN' else 100))
        elif topics[3] == 'position':
            self.mqtt_state_dict = 'OPEN' if payload < self.mqtt_previous_state['position'] else 'CLOSE'
            self.send_smart_blind_command(host_dict[1], {'mode': 'level', 'command': payload}, {'content-type': 'application/json'}, host_dict[0], payload)
        else:
            self.send_smart_blind_command(host_dict[1], {'mode': 'general', 'command': topics[3]}, {'content-type': 'application/json'}, host_dict[0])

options = json.load(open('/data/options.json'))

STATE_URL = 'http://{}:20318/lstinfo'
ACTION_URL = 'http://{}:20318/action'

command = {
    'OPEN': 'TU',
    'CLOSE': 'BD',
    'STOP': 'SS',
}

logger = logging.getLogger()
logger.setLevel(logging.INFO)

formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
stream_handler = logging.StreamHandler()
stream_handler.setFormatter(formatter)
logger.addHandler(stream_handler)

if __name__ == '__main__':
    smart_blind_instance = SmartBlind()
    smart_blinds = smart_blind_instance.find_smart_blinds()
    
    for smart_blind in smart_blinds:
        id, address = smart_blind['id'], smart_blind['address']
        smart_blind_instance.request_smart_blind_state(STATE_URL.format(address), id)

    if not smart_blind_instance.mqtt_connected:
        smart_blind_instance.thread_request_smart_blind_state.cancel()
        
    while True:
        smart_blind_instance.setup_mqtt_client()
