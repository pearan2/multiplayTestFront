import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

// Pong function component props type
interface pongProps {
	width: number;
	height: number;
}

// x,y 포지션을 표기할 때 사용하는 구조체
class Vector {
	x: number;
	y: number;
	constructor(x: number, y: number) {
		this.x = x;
		this.y = y;
	}
}

// Player class 가 implements 하고, 서버와 Player 정보를 주고받을 때 dto 로도 사용
interface IPlayer {
	color: string;
	isUp: boolean;
	isDown: boolean;
	isLeft: boolean;
	isRight: boolean;
	id: string;
	timeStamp: number;
	centerPos: Vector;
	velocity: Vector;
	radius: number;
}

//
interface DeltaPos {
	x: number;
	y: number;
}

class Player implements IPlayer {
	//implements
	color: string;
	isUp: boolean;
	isDown: boolean;
	isLeft: boolean;
	isRight: boolean;
	id: string;
	timeStamp: number; // lastUpdateTimeStamp
	centerPos: Vector;
	velocity: Vector;
	radius: number;
	//
	nextMsgId: number;
	receivedMsgQueue: IPlayer[];
	maxMsgQueueSize = 10;

	constructor(
		centerPos: Vector,
		velocity: Vector,
		radius: number,
		color = 'hsl(' + 360 * Math.random() + ', 50%, 50%)',
		timeStamp = 0
	) {
		this.centerPos = centerPos;
		this.velocity = velocity;
		this.radius = radius;
		this.receivedMsgQueue = [];
		this.nextMsgId = 0;
		this.id = '';
		this.color = color;
		this.isUp = false;
		this.isDown = false;
		this.isLeft = false;
		this.isRight = false;
		this.timeStamp = timeStamp;
	}

	getDelta(playerSnapShotOne: IPlayer, playerSnapShotTwo: IPlayer): DeltaPos {
		const lhs =
			playerSnapShotOne.timeStamp < playerSnapShotTwo.timeStamp
				? playerSnapShotOne
				: playerSnapShotTwo;
		const rhs =
			playerSnapShotOne.timeStamp < playerSnapShotTwo.timeStamp
				? playerSnapShotTwo
				: playerSnapShotOne;
		const timeDiff = rhs.timeStamp - lhs.timeStamp;

		return {
			x: (rhs.centerPos.x - lhs.centerPos.x) / timeDiff,
			y: (rhs.centerPos.y - lhs.centerPos.y) / timeDiff,
		};
	}

	update(now: number, latency: number) {
		now -= 200;
		this.receivedMsgQueue.sort((lhs, rhs) => {
			if (lhs.timeStamp > rhs.timeStamp) return 1;
			else return -1;
		});

		if (this.receivedMsgQueue.length < this.maxMsgQueueSize) {
			return;
		}

		let lhsIdx = 0;
		let rhsIdx = 1;
		for (let i = 0; i < this.receivedMsgQueue.length - 1; i++) {
			lhsIdx = i;
			rhsIdx = i + 1;
			if (this.receivedMsgQueue[i + 1].timeStamp > now) {
				break;
			}
		}
		const lhs = this.receivedMsgQueue[lhsIdx];
		const rhs = this.receivedMsgQueue[rhsIdx];

		const delta = this.getDelta(lhs, rhs);
		if (now < lhs.timeStamp) {
			const timeDiff = lhs.timeStamp - now;
			this.centerPos.x = lhs.centerPos.x - delta.x * timeDiff;
			this.centerPos.y = lhs.centerPos.y - delta.y * timeDiff;
		} else if (now === lhs.timeStamp) {
			this.centerPos.x = lhs.centerPos.x;
			this.centerPos.y = lhs.centerPos.y;
		} else if (now > lhs.timeStamp && now < rhs.timeStamp) {
			const timeDiff = now - lhs.timeStamp;
			this.centerPos.x = lhs.centerPos.x + delta.x * timeDiff;
			this.centerPos.y = lhs.centerPos.y + delta.y * timeDiff;
		} else if (now === rhs.timeStamp) {
			this.centerPos.x = rhs.centerPos.x;
			this.centerPos.y = rhs.centerPos.y;
		} else {
			const timeDiff = now - rhs.timeStamp;
			this.centerPos.x = rhs.centerPos.x + delta.x * timeDiff;
			this.centerPos.y = rhs.centerPos.y + delta.y * timeDiff;
		}
	}

	draw(ctx: CanvasRenderingContext2D) {
		ctx.fillStyle = this.color;
		ctx.beginPath();
		ctx.arc(
			this.centerPos.x,
			this.centerPos.y,
			this.radius,
			0,
			Math.PI * 2,
			true
		);
		ctx.fill();
	}
}

class Me extends Player {
	update(millisDiff: number) {
		//before draw me, update pos
		if (this.isUp) this.centerPos.y -= this.velocity.y * millisDiff;
		if (this.isDown) this.centerPos.y += this.velocity.y * millisDiff;
		if (this.isLeft) this.centerPos.x -= this.velocity.x * millisDiff;
		if (this.isRight) this.centerPos.x += this.velocity.x * millisDiff;
		//
	}
}

interface PingDto {
	clientSendTimeStamp: number;
	clientReceiveTimeStamp: number;
	serverTimeStamp: number;
}

class Game {
	players: Map<string, Player>;
	ctx: CanvasRenderingContext2D;
	startTimeStamp: number;
	lastUpdateTimeStamp: number;
	timeDiffWithServer: number;
	size: Vector;
	socket: Socket;
	me: Me;
	latency: number;
	constructor(
		size: Vector,
		ctx: CanvasRenderingContext2D,
		latencyCheckTimes = 100
	) {
		this.players = new Map();
		this.ctx = ctx;
		this.size = size;
		this.startTimeStamp = Date.now();
		this.lastUpdateTimeStamp = this.startTimeStamp;
		this.timeDiffWithServer = -1;
		///////socket //////////
		this.socket = io('http://localhost:8080');
		this.me = new Me(
			new Vector(this.size.x / 2, this.size.y / 2),
			new Vector(0.2, 0.2),
			20
		);
		const pings: PingDto[] = [];
		this.socket.on('deletePlayer', (id) => {
			this.players.delete(id);
		});
		this.latency = 0;

		this.socket.on('playersInfo', (data) => {
			for (const [key, value] of Object.entries(data)) {
				if (key === this.me.id) continue;
				const iplayers: IPlayer[] = value as IPlayer[];
				if (iplayers.length !== 0 && !this.players.has(key)) {
					this.players.set(
						key,
						new Player(
							iplayers[0].centerPos,
							iplayers[0].velocity,
							iplayers[0].radius,
							iplayers[0].color,
							iplayers[0].timeStamp
						)
					);
				}
				while (iplayers.length) {
					this.players
						.get(key)!
						.receivedMsgQueue.push(iplayers.shift()!);
					if (
						this.players.get(key)!.receivedMsgQueue.length >
						this.players.get(key)!.maxMsgQueueSize
					) {
						this.players.get(key)!.receivedMsgQueue.shift();
					}
				}
			}
		});

		this.socket.on('ping', (data: PingDto) => {
			this.me.id = this.socket.id;
			data.clientReceiveTimeStamp = Date.now();
			pings.push(data);

			if (pings.length === latencyCheckTimes) {
				this.timeDiffWithServer =
					pings
						.map((pingDto) => {
							const latency =
								pingDto.clientReceiveTimeStamp -
								pingDto.clientSendTimeStamp;
							this.latency += latency;
							const clientTimeStamp =
								pingDto.clientSendTimeStamp + latency / 2;
							return pingDto.serverTimeStamp - clientTimeStamp;
						})
						.sort()
						.slice(30, 70)
						.reduce((acc, cur) => {
							return acc + cur;
						}, 0) / 40;
				///////////////
				this.latency /= latencyCheckTimes;
				this.start();
				setInterval(() => {
					const newMe = { ...this.me };
					newMe.timeStamp = this.getNow();
					const data: IPlayer = { ...newMe };
					this.socket.emit('updateMe', data);
				}, 100);
				///////////////
			}
		});

		for (let i = 0; i < latencyCheckTimes; i++) {
			const data: PingDto = {
				clientSendTimeStamp: Date.now(),
				serverTimeStamp: 0,
				clientReceiveTimeStamp: 0,
			};
			this.socket.emit('ping', data);
		}
		////////////////////////
	}
	start() {
		const cb = () => {
			this.draw();
			requestAnimationFrame(cb);
		};
		requestAnimationFrame(cb);
	}

	getNow(): number {
		return Date.now() + this.timeDiffWithServer;
	}

	draw() {
		const millisDiff = this.getNow() - this.lastUpdateTimeStamp;
		this.lastUpdateTimeStamp = this.getNow();
		this.drawMap();
		this.me.update(millisDiff);
		this.me.timeStamp = this.getNow();
		this.me.draw(this.ctx);
		this.players.forEach((player) => {
			player.update(this.getNow(), this.latency);
			player.draw(this.ctx);
		});
	}

	drawMap() {
		this.ctx.fillStyle = '#000';
		this.ctx.fillRect(0, 0, this.size.x, this.size.y);
	}
}

const Pong = (props: pongProps) => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const gameRef = useRef<Game | null>(null);

	useEffect(() => {
		if (canvasRef.current) {
			gameRef.current = new Game(
				new Vector(props.width, props.height),
				canvasRef.current!.getContext('2d')!
			);
			const keyEventCallBack = (event: KeyboardEvent) => {
				const me = gameRef.current?.me;
				if (!me) return;

				switch (event.key) {
					case 'ArrowUp': {
						if (event.type === 'keydown') me.isUp = true;
						else if (event.type === 'keyup') me.isUp = false;
						break;
					}
					case 'ArrowLeft': {
						if (event.type === 'keydown') me.isLeft = true;
						else if (event.type === 'keyup') me.isLeft = false;
						break;
					}
					case 'ArrowDown': {
						if (event.type === 'keydown') me.isDown = true;
						else if (event.type === 'keyup') me.isDown = false;
						break;
					}
					case 'ArrowRight': {
						if (event.type === 'keydown') me.isRight = true;
						else if (event.type === 'keyup') me.isRight = false;
						break;
					}
					default: {
						break;
					}
				}
			};
			document.addEventListener('keydown', keyEventCallBack);
			document.addEventListener('keyup', keyEventCallBack);

			gameRef.current.draw();
			/////////////////
		}
	}, [canvasRef.current]);

	return (
		<canvas
			ref={canvasRef}
			width={props.width}
			height={props.height}
			style={{
				margin: '0 auto',
				height: '100%',
			}}
		></canvas>
	);
};

export default Pong;
