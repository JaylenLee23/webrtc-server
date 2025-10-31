import express from "express";
import bodyParser from "body-parser";
import * as mediasoup from "mediasoup";

const app = express();
app.use(bodyParser.text({ type: 'application/sdp' }));

// ---------- mediasoup 初始化 ----------
let worker, router;
const mediaCodecs = [
    {
        kind: "audio",
        mimeType: "audio/opus",
        clockRate: 48000,
        channels: 2,
    },
    {
        kind: "video",
        mimeType: "video/VP8",
        clockRate: 90000,
        parameters: { "x-google-start-bitrate": 1000 },
    },
];

async function startMediasoup() {
    worker = await mediasoup.createWorker();
    router = await worker.createRouter({ mediaCodecs });
    console.log("✅ mediasoup worker started");
}
startMediasoup();

// ---------- 存储 Producer / Consumer ----------
const producers = new Map();

// ---------- WHIP 推流接口 ----------
app.post("/whip/:id", async (req, res) => {
    const sdpOffer = req.body;
    const peerId = req.params.id;

    const transport = await router.createWebRtcTransport({
        listenIps: [{ ip: "0.0.0.0", announcedIp: "YOUR_PUBLIC_IP" }],
        enableUdp: true,
        enableTcp: true,
    });

    const { sdpAnswer, rtpParameters } = await transport.connect({ dtlsParameters: {} });
    const producer = await transport.produce({ kind: "video", rtpParameters });
    producers.set(peerId, producer);

    res.set("Content-Type", "application/sdp");
    res.send(sdpAnswer);
});

// ---------- WHEP 拉流接口 ----------
app.post("/whep/:id", async (req, res) => {
    const sdpOffer = req.body;
    const peerId = req.params.id;

    const producer = producers.get(peerId);
    if (!producer) {
        res.status(404).send("No stream found");
        return;
    }

    const transport = await router.createWebRtcTransport({
        listenIps: [{ ip: "0.0.0.0", announcedIp: "YOUR_PUBLIC_IP" }],
        enableUdp: true,
        enableTcp: true,
    });

    const consumer = await transport.consume({
        producerId: producer.id,
        rtpCapabilities: router.rtpCapabilities,
    });

    res.set("Content-Type", "application/sdp");
    res.send("...sdp answer...");
});

// ---------- 启动服务 ----------
const PORT = 8080;
app.listen(PORT, () => console.log(`🚀 WHIP/WHEP server running on port ${PORT}`));
