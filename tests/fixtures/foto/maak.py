# UI-002: maakt de testarchieven voor de fotodienst (echte JPEG's met EXIF, echte ZIP-structuren van Takeout/Instagram/
# Facebook/Telegram/Flickr). Opnieuw maken: python3 tests/fixtures/foto/maak.py  (Pillow nodig). Uitvoer naast dit script.
import io, json, os, zipfile, random
from PIL import Image, ImageDraw
HIER = os.path.dirname(os.path.abspath(__file__))
def beeld(kleur, tekst, w=320, h=240, ruis=0, exif=None):
    im = Image.new('RGB', (w, h), kleur); d = ImageDraw.Draw(im)
    for k in range(6): d.ellipse((20 + k * 40, 40 + (k % 3) * 40, 70 + k * 40, 90 + (k % 3) * 40), fill=((k * 40) % 255, 120, 200 - k * 20))
    d.text((10, 10), tekst, fill=(255, 255, 255))
    if ruis:
        random.seed(ruis)
        for _ in range(40): x, y = random.randrange(w), random.randrange(h); im.putpixel((x, y), (255, 255, 255))
    b = io.BytesIO(); kw = {'format': 'JPEG', 'quality': 85}
    if exif: kw['exif'] = exif
    im.save(b, **kw); return b.getvalue()
def exif(datum, merk, model, lat=None, lon=None):
    e = Image.Exif(); e[0x010f] = merk; e[0x0110] = model
    e.get_ifd(0x8769)[0x9003] = datum
    if lat is not None:
        g = e.get_ifd(0x8825)
        dms = lambda v: (int(abs(v)), int((abs(v) * 60) % 60), round((abs(v) * 3600) % 60, 2))
        g[1] = 'N' if lat >= 0 else 'S'; g[2] = dms(lat); g[3] = 'E' if lon >= 0 else 'W'; g[4] = dms(lon)
    return e
a = beeld((30, 80, 120), 'Kyiv 2014')
c = beeld((90, 30, 40), 'Camera 2016', exif=exif('2016:05:03 10:20:30', 'Canon', 'Canon EOS 600D', 48.6208, 22.2879))
c2 = beeld((90, 30, 40), 'Camera 2016', ruis=7, exif=exif('2016:05:03 10:20:31', 'Canon', 'Canon EOS 600D'))
k = beeld((20, 110, 60), 'Karpaty')
# --- Google Takeout
with zipfile.ZipFile(os.path.join(HIER, 'takeout.zip'), 'w') as z:
    z.writestr('Takeout/Google Photos/Photos from 2014/IMG_001.jpg', a)
    z.writestr('Takeout/Google Photos/Photos from 2014/IMG_001.jpg.supplemental-metadata.json', json.dumps({'title': 'IMG_001.jpg', 'description': 'Хрещатик увечері', 'photoTakenTime': {'timestamp': '1405180800'}, 'geoData': {'latitude': 50.4501, 'longitude': 30.5234}}))
    z.writestr('Takeout/Google Photos/Photos from 2014/IMG_001(1).jpg', a)
    z.writestr('Takeout/Google Photos/Photos from 2014/IMG_001.jpg.supplemental-metadata(1).json', json.dumps({'photoTakenTime': {'timestamp': '1405180800'}}))
    z.writestr('Takeout/Google Photos/Відпустка Карпати/IMG_002.jpg', k)
    z.writestr('Takeout/Google Photos/Відпустка Карпати/IMG_002.jpg.json', json.dumps({'photoTakenTime': {'timestamp': '1500000000'}, 'geoData': {'latitude': 0.0, 'longitude': 0.0}}))
    z.writestr('Takeout/Google Photos/Відпустка Карпати/metadata.json', json.dumps({'title': 'Відпустка в Карпатах'}))
    z.writestr('Takeout/Google Photos/Photos from 2016/DSC_0003.jpg', c)
    z.writestr('Takeout/Google Photos/Photos from 2016/DSC_0004.jpg', c2)
    z.writestr('Takeout/archive_browser.html', '<html></html>')
# --- Instagram (JSON-export; tekst in Meta-«mojibake»)
moji = 'Привіт з моря'.encode('utf-8').decode('latin-1')
with zipfile.ZipFile(os.path.join(HIER, 'instagram.zip'), 'w') as z:
    z.writestr('media/posts/201905/insta1.jpg', beeld((200, 140, 40), 'insta'))
    z.writestr('your_instagram_activity/content/posts_1.json', json.dumps([{'media': [{'uri': 'media/posts/201905/insta1.jpg', 'creation_timestamp': 1557000000, 'title': moji}]}]))
# --- Facebook album
with zipfile.ZipFile(os.path.join(HIER, 'facebook.zip'), 'w') as z:
    z.writestr('your_facebook_activity/posts/media/Mobile_uploads/fb1.jpg', beeld((120, 40, 160), 'fb'))
    z.writestr('your_facebook_activity/posts/album/0.json', json.dumps({'name': 'Mobile uploads', 'photos': [{'uri': 'your_facebook_activity/posts/media/Mobile_uploads/fb1.jpg', 'creation_timestamp': 1420000000, 'media_metadata': {'photo_metadata': {'exif_data': [{'latitude': 52.37, 'longitude': 4.89, 'taken_timestamp': 1419990000}]}}}]}))
# --- Telegram Desktop
with zipfile.ZipFile(os.path.join(HIER, 'telegram.zip'), 'w') as z:
    z.writestr('ChatExport_2021/photos/photo_1@01-02-2021_10-00-00.jpg', beeld((60, 60, 60), 'tg'))
    z.writestr('ChatExport_2021/result.json', json.dumps({'name': 'Мама', 'messages': [{'id': 1, 'date_unixtime': '1612173600', 'photo': 'photos/photo_1@01-02-2021_10-00-00.jpg', 'text': ['Дивись!']}]}, ensure_ascii=False))
# --- Flickr
with zipfile.ZipFile(os.path.join(HIER, 'flickr.zip'), 'w') as z:
    z.writestr('data/zeilen_123456_o.jpg', beeld((10, 90, 180), 'flickr'))
    z.writestr('data/photo_123456.json', json.dumps({'id': '123456', 'name': 'Zeilen', 'date_taken': '2010-08-01 14:00:00', 'tags': [{'tag': 'zee'}], 'albums': [{'title': 'Zomer 2010'}], 'geo': [{'latitude': '52370000', 'longitude': '4890000'}]}))
open(os.path.join(HIER, 'los-exif.jpg'), 'wb').write(c)
print('klaar')
open(os.path.join(HIER, 'cloud-nieuw.jpg'), 'wb').write(beeld((150, 150, 30), 'Cloud 2018', exif=exif('2018:09:01 08:00:00', 'Apple', 'iPhone 8', 50.45, 30.52)))
