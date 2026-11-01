# Scout (Codex), 1 November 2026. Text-only artwork from Sterling's approved essay.
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
r=Path(__file__).resolve().parents[1]
bg='#101321';gold='#edca73';ivory='#f7f1e6';muted='#d6cebf'
def font(n,serif=False):return ImageFont.truetype('/System/Library/Fonts/Supplemental/'+('Georgia.ttf' if serif else 'Arial.ttf'),n)
def card(w,h,portrait=False):
 im=Image.new('RGB',(w,h),bg);d=ImageDraw.Draw(im);m=int(w*.09)
 d.line((m,int(h*.12),w-m,int(h*.12)),fill=gold,width=2)
 d.text((m,int(h*.065)),'THAI GL WEEKLY',font=font(int(w*.027)),fill=gold)
 d.text((m,int(h*.19)),'THE BUSINESS OF LOVE',font=font(int(w*.026)),fill=gold)
 y=int(h*.29);size=int(w*(.083 if portrait else .061))
 for line in ['Building Their','Own House']:
  d.text((m,y),line,font=font(size,True),fill=ivory);y+=int(size*1.3)
 lines=['The pairing goes on.','What changed is whose','name is on the door.'] if portrait else ['The pairing goes on. What changed','is whose name is on the door.']
 y+=int(h*.055)
 if not portrait:y=int(h*.60)
 for line in lines:d.text((m,y),line,font=font(int(w*(.038 if portrait else .029)),True),fill=muted);y+=int(w*(.056 if portrait else .038))
 d.text((m,int(h*.78)),'OPINION BY STERLING GREY',font=font(int(w*.027)),fill=gold)
 d.text((m,int(h*.86)),'Read free at thaiglweekly.com',font=font(int(w*.032)),fill=ivory)
 d.line((m,int(h*.94),w-m,int(h*.94)),fill=gold,width=2)
 return im
card(1200,630).save(r/'assets/social/building-their-own-house-v1.png')
card(1080,1920,True).save(r/'assets/social/building-their-own-house-live-1080x1920.png')
print('Rendered share card and portrait live card from approved title/dek.')
