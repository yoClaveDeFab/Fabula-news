# Fabula News: trabajo de video en Kaggle (GPU gratuita).
# La app sustituye los marcadores __GUION__, __TITULO__, __FUENTE__ e __IMAGEN_B64__ antes de enviarlo.
# Resultado: /kaggle/working/fabula.mp4

import os, sys, subprocess, base64, re, glob, time, shutil, textwrap, urllib.request

GUION = __GUION__
TITULO = __TITULO__
FUENTE = __FUENTE__
IMAGEN_B64 = __IMAGEN_B64__
VOZ_URL = 'https://raw.githubusercontent.com/yoClaveDeFab/Fabula-news/main/colab/voz_referencia.wav'

W = '/kaggle/working'
os.makedirs(W, exist_ok=True)

def sh(cmd):
    print('>>', cmd[:120], flush=True)
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout[-3000:], r.stderr[-3000:])
        raise RuntimeError('Fallo: ' + cmd[:80])

# ---------- 1. Instalación ----------
t0 = time.time()
if not os.path.exists('/kaggle/working/SadTalker'):
    sh('git clone -q https://github.com/OpenTalker/SadTalker.git /kaggle/working/SadTalker')
os.chdir('/kaggle/working/SadTalker')
sh('pip install -q chatterbox-tts faster-whisper torch==2.6.0 torchvision==0.21.0 torchaudio==2.6.0 --extra-index-url https://download.pytorch.org/whl/cu124')
sh('pip install -q face_alignment imageio imageio-ffmpeg librosa numba resampy pydub kornia tqdm yacs pyyaml joblib scikit-image basicsr facexlib gfpgan av safetensors')
sh('apt-get -qq install -y ffmpeg fonts-dejavu-core > /dev/null 2>&1 || true')
for f in glob.glob('/opt/conda/lib/python3.*/site-packages/basicsr/data/degradations.py') + glob.glob('/usr/local/lib/python3.*/dist-packages/basicsr/data/degradations.py'):
    s = open(f).read().replace('from torchvision.transforms.functional_tensor import rgb_to_grayscale',
                               'from torchvision.transforms.functional import rgb_to_grayscale')
    open(f, 'w').write(s)
if not os.path.exists('checkpoints/SadTalker_V0.0.2_256.safetensors'):
    sh('bash scripts/download_models.sh')
print(f'Instalación lista en {time.time()-t0:.0f}s', flush=True)

# ---------- 2. Entradas ----------
REF = f'{W}/voz_referencia.wav'
urllib.request.urlretrieve(VOZ_URL, REF)
IMG = f'{W}/personaje.jpg'
open(IMG, 'wb').write(base64.b64decode(IMAGEN_B64))

# ---------- 3. Modelos ----------
import torch, torchaudio
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
from faster_whisper import WhisperModel
device = 'cuda' if torch.cuda.is_available() else 'cpu'
print('GPU:', torch.cuda.is_available(), flush=True)
tts = ChatterboxMultilingualTTS.from_pretrained(device=device)
whisper = WhisperModel('small', device=device, compute_type='float16' if device == 'cuda' else 'int8')

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
ROSA = '&HB300FF&'

def clonar_voz(texto, out_wav):
    frases = [f.strip() for f in re.split(r'(?<=[.!?])\s+', texto) if f.strip()]
    partes = []
    for f in frases:
        wav = tts.generate(f, language_id='es', audio_prompt_path=REF, exaggeration=0.45, cfg_weight=0.5)
        partes.append(wav)
        partes.append(torch.zeros(1, int(tts.sr * 0.25)))
    torchaudio.save(out_wav, torch.cat(partes, dim=1), tts.sr)
    return out_wav

def ass_time(s):
    cs = int(round(s * 100))
    return f"{cs//360000}:{(cs%360000)//6000:02d}:{(cs%6000)//100:02d}.{cs%100:02d}"

def subtitulos_ass(wav, out_ass, por_frase=4):
    segs, _ = whisper.transcribe(wav, language='es', word_timestamps=True)
    words = [w for s in segs for w in s.words]
    header = (
        "[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2\n\n"
        "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
        "Style: Fabula,DejaVu Sans,64,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,3,16,0,5,60,60,0,1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n")
    lines = []
    for i in range(0, len(words), por_frase):
        g = words[i:i+por_frase]
        start = g[0].start
        end = words[i+por_frase].start if i+por_frase < len(words) else g[-1].end + 0.4
        longest = max(range(len(g)), key=lambda k: len(g[k].word.strip()))
        txt = ' '.join((f"{{\\c{ROSA}}}{w.word.strip()}{{\\c&HFFFFFF&}}" if k == longest else w.word.strip()) for k, w in enumerate(g))
        lines.append(f"Dialogue: 0,{ass_time(start)},{ass_time(end)},Fabula,,0,0,0,,{txt}")
    open(out_ass, 'w').write(header + '\n'.join(lines) + '\n')
    return out_ass

def animar_avatar(imagen, wav, out_dir):
    cmd = [sys.executable, 'inference.py', '--driven_audio', wav, '--source_image', imagen,
           '--result_dir', out_dir, '--still', '--preprocess', 'full', '--enhancer', 'gfpgan', '--size', '256']
    p = subprocess.run(cmd, capture_output=True, text=True, cwd='/kaggle/working/SadTalker')
    if p.returncode != 0:
        print(p.stderr[-3000:])
        raise RuntimeError('SadTalker falló')
    vids = glob.glob(f'{out_dir}/**/*.mp4', recursive=True)
    if not vids:
        raise RuntimeError('SadTalker no generó video; usa una foto de frente con la cara despejada.')
    return vids[-1]

def esc(t):
    return t.replace('\\', '\\\\').replace(':', '\\:').replace("'", "\\'").replace('%', '\\%')

def montar(avatar_mp4, wav, ass, titulo, fuente, out_mp4):
    tit = '\n'.join(textwrap.wrap(titulo.upper(), 16)[:4])
    intro = out_mp4.replace('.mp4', '_intro.mp4')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0xF4F4F2:s=1080x1920:d=2.5:r=25',
        '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', '2.5',
        '-vf', f"drawtext=fontfile={FONT}:text='{esc(tit)}':fontsize=96:fontcolor=0x111111:x=(w-text_w)/2:y=(h-text_h)/2:line_spacing=12,"
               f"drawtext=fontfile={FONT}:text='FABULA NEWS':fontsize=34:fontcolor=0x777777:x=(w-text_w)/2:y=h-220",
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', intro], check=True)
    cuerpo = out_mp4.replace('.mp4', '_cuerpo.mp4')
    vf = (f"[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30[bg];"
          f"[0:v]scale=1080:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2-380,"
          + (f"drawbox=x=60:y=1500:w=960:h=80:color=0x111111@0.85:t=fill,"
             f"drawtext=fontfile={FONT}:text='FUENTE\\: {esc(fuente.upper())}':fontsize=30:fontcolor=white:x=90:y=1524," if fuente.strip() else "")
          + f"ass={ass}")
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', avatar_mp4, '-i', wav, '-filter_complex', vf,
        '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '25', '-c:a', 'aac', '-shortest', cuerpo], check=True)
    lst = out_mp4.replace('.mp4', '_list.txt')
    open(lst, 'w').write(f"file '{intro}'\nfile '{cuerpo}'\n")
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', out_mp4], check=True)
    return out_mp4

# ---------- 4. Pipeline ----------
work = f'{W}/job'
os.makedirs(work, exist_ok=True)
print('Clonando voz...', flush=True)
wav = clonar_voz(GUION.strip(), f'{work}/voz.wav')
print('Subtítulos...', flush=True)
ass = subtitulos_ass(wav, f'{work}/subs.ass')
print('Animando avatar...', flush=True)
av = animar_avatar(IMG, wav, f'{work}/sad')
print('Montaje 9:16...', flush=True)
final = montar(av, wav, ass, TITULO or 'Fabula News', FUENTE or '', f'{W}/fabula.mp4')

# Limpieza: solo dejamos el mp4 como salida
shutil.rmtree(work, ignore_errors=True)
shutil.rmtree('/kaggle/working/SadTalker', ignore_errors=True)
os.remove(IMG); os.remove(REF)
print('LISTO:', final, os.path.getsize(final)//1024, 'KB', f'({time.time()-t0:.0f}s)', flush=True)
