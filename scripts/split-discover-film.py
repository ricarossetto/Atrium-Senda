"""Export four silent chapters from the 15-second ATRIUM brand film (FFmpeg only)."""
import argparse
from pathlib import Path
import subprocess
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CHAPTERS = ((0, 140, 1.7, (74,)), (140, 216, 6.4, ()), (216, 293, 8.9, ()), (293, 450, 14.1, (69,)))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ffmpeg', default='ffmpeg')
    parser.add_argument('--source', type=Path, default=ROOT / 'research/motion/atrium-film-15s.mp4')
    parser.add_argument('--preserve-master', action='store_true')
    args = parser.parse_args()
    if not args.source.is_file():
        raise RuntimeError('The 15-second source film is required')
    output = ROOT / 'assets/images'
    if not output.is_dir():
        raise RuntimeError('Existing assets/images directory required')
    run = lambda command: subprocess.run([args.ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', *command], check=True)
    for i, (begin, end, poster, transitions) in enumerate(CHAPTERS, start=1):
        frames = end - begin
        decoder = subprocess.Popen([args.ffmpeg, '-hide_banner', '-loglevel', 'error', '-i', str(args.source),
                                    '-an', '-vf', f'trim=start_frame={begin}:end_frame={end},scale=1280:720',
                                    '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], stdout=subprocess.PIPE)
        images = []
        try:
            for _ in range(frames):
                raw = decoder.stdout.read(1280 * 720 * 3)
                if len(raw) != 1280 * 720 * 3:
                    raise RuntimeError(f'Chapter {i} has fewer than {frames} frames')
                images.append(Image.frombytes('RGB', (1280, 720), raw))
            decoder.stdout.close()
            if decoder.wait():
                raise RuntimeError(f'Unable to decode chapter {i}')
        finally:
            if decoder.poll() is None:
                decoder.kill()
                decoder.wait()
        background = Image.new('RGB', (1280, 720), (17, 19, 21))
        for at in transitions:
            for n in range(at - 9, at):
                images[n] = Image.blend(images[n], background, (n - at + 10) / 10)
            for n in range(at, at + 9):
                images[n] = Image.blend(background, images[n], (n - at + 1) / 10)
        for n in range(9):
            images[n] = Image.blend(Image.new('RGB', (1280, 720), (17, 19, 21)), images[n], (n + 1) / 10)
            images[frames - 9 + n] = Image.blend(images[frames - 9 + n], Image.new('RGB', (1280, 720), (17, 19, 21)), (n + 1) / 9)
        encoder = subprocess.Popen([args.ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo',
                                    '-pix_fmt', 'rgb24', '-s', '1280x720', '-r', '30', '-i', 'pipe:0',
                                    '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19',
                                    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(output / f'discover-film-{i:02}.mp4')],
                                   stdin=subprocess.PIPE)
        try:
            for image in images:
                encoder.stdin.write(image.tobytes())
            encoder.stdin.close()
            if encoder.wait():
                raise RuntimeError(f'Unable to encode chapter {i}')
        finally:
            if encoder.poll() is None:
                encoder.kill()
                encoder.wait()
        run(['-ss', str(poster), '-i', str(args.source), '-frames:v', '1', '-vf', 'scale=1280:720',
             '-q:v', '2', str(output / f'discover-film-{i:02}.jpg')])
    if args.preserve_master:
        master = ROOT / 'research/motion'
        master.mkdir(parents=True, exist_ok=True)
        run(['-i', str(args.source), '-map', '0:v:0', '-c:v', 'copy', '-an', '-movflags', '+faststart', str(master / 'atrium-film-15s.mp4')])
    print('Four chapters, 450 frames total, no audio. Posters and source preserved.')


if __name__ == '__main__':
    main()
