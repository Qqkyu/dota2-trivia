import { spawn } from "node:child_process";
import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { delay } from "./feedback-browser.mjs";

export const SAMPLE_RATE = 44_100;

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode || !child.pid) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  const kill = setTimeout(() => child.kill("SIGKILL"), 2_000);
  await exited;
  clearTimeout(kill);
}

// Record the browser's final native mix. No speakers, captureStream(), Web Audio
// rerouting, autoplay exemptions, or changes to the user's audio server.
export async function nativeAudioOutput() {
  const directory = await mkdtemp(join(tmpdir(), "queue-arcade-output-"));
  const root = process.env.SOUND_PULSE_ROOT ?? join(homedir(), ".cache/queue-arcade/sound-tools");
  const unpacked = await access(join(root, "usr/bin/pulseaudio")).then(
    () => true,
    () => false,
  );
  const env = {
    ...process.env,
    PULSE_SERVER: `unix:${join(directory, "pulse.sock")}`,
    PULSE_RUNTIME_PATH: join(directory, "runtime"),
    PULSE_STATE_PATH: join(directory, "state"),
    PULSE_CONFIG_PATH: directory,
    DBUS_SESSION_BUS_ADDRESS: "unix:path=/dev/null",
  };
  const args = [
    "-n",
    "--daemonize=no",
    "--exit-idle-time=-1",
    "--use-pid-file=no",
    "--disable-shm=true",
    `--load=module-native-protocol-unix socket=${join(directory, "pulse.sock")} auth-anonymous=1`,
    `--load=module-null-sink sink_name=arcade rate=${SAMPLE_RATE} channels=2 format=float32le`,
    "--log-level=error",
  ];
  if (unpacked) {
    const lib = join(root, "usr/lib");
    const entries = await readdir(lib);
    const modules = join(
      lib,
      entries.find((name) => name.startsWith("pulse-")),
      "modules",
    );
    const multiarch = entries.find((name) => name.endsWith("-linux-gnu"));
    env.LD_LIBRARY_PATH = [
      join(lib, multiarch),
      join(lib, multiarch, "pulseaudio"),
      modules,
      process.env.LD_LIBRARY_PATH,
    ]
      .filter(Boolean)
      .join(":");
    args.push(`--dl-search-path=${modules}`);
  }
  const bin = (name) => (unpacked ? join(root, "usr/bin", name) : name);
  let server, recorder, error;
  let log = "";
  const chunks = [];
  let bytes = 0;
  function watch(child) {
    child.on("error", (failure) => {
      error = failure;
    });
    child.stderr.on("data", (data) => {
      log = (log + data).slice(-2_000);
    });
    return child;
  }
  async function close() {
    await stop(recorder);
    await stop(server);
    await rm(directory, { recursive: true, force: true });
  }
  try {
    server = watch(spawn(bin("pulseaudio"), args, { env, stdio: ["ignore", "ignore", "pipe"] }));
    const deadline = Date.now() + 8_000;
    while (
      !(await access(join(directory, "pulse.sock")).then(
        () => true,
        () => false,
      ))
    ) {
      if (error || server.exitCode !== null || Date.now() > deadline) {
        throw new Error(
          `Native audio recorder needs pulseaudio and parec (or SOUND_PULSE_ROOT). ${error?.message ?? log}`,
        );
      }
      await delay(25);
    }
    recorder = watch(
      spawn(
        bin("parec"),
        [
          "--raw",
          "--format=float32le",
          `--rate=${SAMPLE_RATE}`,
          "--channels=2",
          "--device=arcade.monitor",
          "--latency-msec=10",
        ],
        { env, stdio: ["ignore", "pipe", "pipe"] },
      ),
    );
    recorder.stdout.on("data", (data) => {
      chunks.push(data);
      bytes += data.length;
    });
    while (!bytes) {
      if (error || recorder.exitCode !== null || Date.now() > deadline) {
        throw new Error(`Native audio recorder did not produce PCM: ${error?.message ?? log}`);
      }
      await delay(25);
    }
    return {
      env,
      mark: () => bytes - (bytes % 8),
      read(mark) {
        const buffer = Buffer.concat(chunks).subarray(mark);
        const channels = [
          new Float64Array(Math.floor(buffer.length / 8)),
          new Float64Array(Math.floor(buffer.length / 8)),
        ];
        for (let frame = 0; frame < channels[0].length; frame++) {
          channels[0][frame] = buffer.readFloatLE(frame * 8);
          channels[1][frame] = buffer.readFloatLE(frame * 8 + 4);
        }
        return channels;
      },
      close,
    };
  } catch (failure) {
    await close();
    throw failure;
  }
}

export function wavChannels(buffer) {
  let format, pcm;
  for (let offset = 12; offset + 8 <= buffer.length; ) {
    const tag = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (tag === "fmt ") format = buffer.subarray(offset + 8, offset + 8 + size);
    if (tag === "data") pcm = buffer.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  if (
    !format ||
    !pcm ||
    format.readUInt16LE(0) !== 1 ||
    format.readUInt16LE(14) !== 16 ||
    format.readUInt32LE(4) !== SAMPLE_RATE
  ) {
    throw new Error("Sound reference must be 44.1 kHz 16-bit PCM WAV");
  }
  const count = format.readUInt16LE(2);
  return Array.from({ length: count }, (_, channel) =>
    Float64Array.from(
      { length: pcm.length / (count * 2) },
      (_, frame) => pcm.readInt16LE((frame * count + channel) * 2) / 32768,
    ),
  );
}

function fft(real, imaginary, inverse = false) {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imaginary[i], imaginary[j]] = [imaginary[j], imaginary[i]];
    }
  }
  for (let length = 2; length <= n; length *= 2) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / length;
    const stepReal = Math.cos(angle),
      stepImaginary = Math.sin(angle);
    for (let start = 0; start < n; start += length) {
      let wr = 1,
        wi = 0;
      for (let j = 0; j < length / 2; j++) {
        const a = start + j,
          b = a + length / 2;
        const br = real[b] * wr - imaginary[b] * wi;
        const bi = real[b] * wi + imaginary[b] * wr;
        real[b] = real[a] - br;
        imaginary[b] = imaginary[a] - bi;
        real[a] += br;
        imaginary[a] += bi;
        [wr, wi] = [wr * stepReal - wi * stepImaginary, wr * stepImaginary + wi * stepReal];
      }
    }
  }
  if (inverse)
    for (let i = 0; i < n; i++) {
      real[i] /= n;
      imaginary[i] /= n;
    }
}

export const sampleEnergy = (samples) => samples.reduce((total, value) => total + value * value, 0);

// Locate one full reference waveform, then subtract it at its REQUIRED gain.
// A delayed second copy remains in the residual, even if play() was called once
// in the inspected tab or the doubled mix happens to have the expected energy.
export function subtractWaveform(output, reference) {
  const size = 2 ** Math.ceil(Math.log2(output.length + reference.length));
  const ar = new Float64Array(size),
    ai = new Float64Array(size);
  const br = new Float64Array(size),
    bi = new Float64Array(size);
  ar.set(output);
  br.set(reference);
  fft(ar, ai);
  fft(br, bi);
  for (let i = 0; i < size; i++) {
    [ar[i], ai[i]] = [ar[i] * br[i] + ai[i] * bi[i], ai[i] * br[i] - ar[i] * bi[i]];
  }
  fft(ar, ai, true);
  let offset = 0;
  for (let i = 1; i <= output.length - reference.length; i++) if (ar[i] > ar[offset]) offset = i;
  const gain = ar[offset] / sampleEnergy(reference);
  for (let i = 0; i < reference.length && offset + i < output.length; i++) output[offset + i] -= reference[i];
  return { offset, gain };
}
