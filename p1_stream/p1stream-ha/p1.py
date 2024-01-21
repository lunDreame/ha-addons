#!/usr/bin/python3

import struct
import os
import socket
import ssl
import time
import argparse

parser = argparse.ArgumentParser(description='P1 Streamer')
parser.add_argument('-a', '--access-code', help='Printer Access code', required=True)
parser.add_argument('-i', '--ip', help='Printer IP Address', required=True)
args = parser.parse_args()

username = 'bblp'
access_code = args.access_code
hostname = args.ip
port = 6000

MAX_CONNECT_ATTEMPTS = 12

auth_data = bytearray()
connect_attempts = 0

auth_data += struct.pack("<I", 0x40)   
auth_data += struct.pack("<I", 0x3000) 
auth_data += struct.pack("<I", 0)     
auth_data += struct.pack("<I", 0)      
for i in range(0, len(username)):
    auth_data += struct.pack("<c", username[i].encode('ascii'))
for i in range(0, 32 - len(username)):
    auth_data += struct.pack("<x")
for i in range(0, len(access_code)):
    auth_data += struct.pack("<c", access_code[i].encode('ascii'))
for i in range(0, 32 - len(access_code)):
    auth_data += struct.pack("<x")

ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

jpeg_start = bytearray([0xff, 0xd8, 0xff, 0xe0])
jpeg_end = bytearray([0xff, 0xd9])

read_chunk_size = 4096 

while connect_attempts < MAX_CONNECT_ATTEMPTS:
    try:
        with socket.create_connection((hostname, port)) as sock:
            try:
                connect_attempts += 1
                sslSock = ctx.wrap_socket(sock, server_hostname=hostname)
                sslSock.write(auth_data)
                img = None
                payload_size = 0

                status = sslSock.getsockopt(socket.SOL_SOCKET, socket.SO_ERROR)
                if status != 0:
                    pass
            except socket.error as e:
                pass

            sslSock.setblocking(False)
            while True:
                try:
                    dr = sslSock.recv(read_chunk_size)
                except ssl.SSLWantReadError:
                    time.sleep(1)
                    continue
                except Exception as e:
                    time.sleep(1)
                    continue

                if img is not None and len(dr) > 0:
                    img += dr
                    if len(img) > payload_size:
                        img = None
                    elif len(img) == payload_size:
                        if img[:4] != jpeg_start:
                            pass
                        elif img[-2:] != jpeg_end:
                            pass
                        else:
                            os.write(1, img)

                        img = None
                    # else:     

                elif len(dr) == 16:
                    connect_attempts = 0
                    img = bytearray()
                    payload_size = int.from_bytes(dr[0:3], byteorder='little')
                elif len(dr) == 0:
                    time.sleep(5)
                    break
                else:
                    time.sleep(1)

    except Exception as e:
        pass
