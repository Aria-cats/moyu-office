"""Run from repository root: browser-use < tests/check_boss.browser.py.
Uses an isolated ephemeral API server/database, never the user's shared pond.
"""
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import time
import urllib.request

spec = importlib.util.spec_from_file_location('moyu_ui_server', Path.cwd() / 'server.py')
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)
temporary = tempfile.TemporaryDirectory()
app.DB = Path(temporary.name) / 'ui.sqlite3'
app.TARGET = 20
app.RATE = 10000
app.initialize()
server = app.ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
URL = f'http://127.0.0.1:{server.server_address[1]}/?qa=boss-regression'
new_tab(URL)
wait_for_load()
owned = next(t['targetId'] for t in list_tabs() if t.get('url') == URL)


def check(expression, message):
    actual = js(expression)
    if not actual:
        print(js("({ready:document.readyState,focus:document.hasFocus(),mode:typeof bossMode==='undefined'?null:bossMode,hidden:document.querySelector('#workPage').hidden,active:document.activeElement.id,dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>d.id)})"))
    assert actual, message
    print('PASS:', message)


def press(key, code, number):
    cdp('Input.dispatchKeyEvent', type='keyDown', key=key, code=code, windowsVirtualKeyCode=number, **({'text': '\r'} if key=='Enter' else {}))
    cdp('Input.dispatchKeyEvent', type='keyUp', key=key, code=code, windowsVirtualKeyCode=number)


def escape():
    press('Escape', 'Escape', 27)


def click(name, role='button'):
    node = next(n for n in cdp('Accessibility.getFullAXTree')['nodes']
                if n.get('role', {}).get('value') == role and ''.join(n.get('name', {}).get('value', '').split()) == ''.join(name.split()))
    cdp('DOM.scrollIntoViewIfNeeded', backendNodeId=node['backendDOMNodeId'])
    q = cdp('DOM.getBoxModel', backendNodeId=node['backendDOMNodeId'])['model']['content']
    click_at_xy(sum(q[0::2]) / 4, sum(q[1::2]) / 4)


cdp('Emulation.setFocusEmulationEnabled', enabled=True)
try:
    for _ in range(40):
        if js("typeof setBossMode==='function' && !!state && document.hasFocus()"):break
        time.sleep(.1)
    js("window.__bossErrors=[];window.addEventListener('error',e=>__bossErrors.push(e.message));window.addEventListener('unhandledrejection',e=>__bossErrors.push(String(e.reason)))")
    escape()
    check("bossMode && !document.querySelector('#workPage').hidden && document.querySelector('main').inert", 'Esc enters work view and disables background controls')
    cdp('Input.dispatchKeyEvent', type='keyDown', key='Escape', code='Escape', windowsVirtualKeyCode=27, autoRepeat=True)
    cdp('Input.dispatchKeyEvent', type='keyUp', key='Escape', code='Escape', windowsVirtualKeyCode=27)
    check('bossMode', 'holding Esc does not repeatedly toggle')
    escape()
    check("!bossMode && document.querySelector('#workPage').hidden && !document.querySelector('main').inert && document.title.includes('摸鱼办事处')", 'second Esc returns and restores page title')

    click('▦ 老板来了 Esc')
    click('返回上一页 Esc')
    check('!bossMode', 'mouse entry and visible return button work')

    click('修改摸鱼昵称')
    textbox = next(n for n in cdp('Accessibility.getFullAXTree')['nodes'] if n.get('role', {}).get('value') == 'textbox')
    q = cdp('DOM.getBoxModel', backendNodeId=textbox['backendDOMNodeId'])['model']['content']
    click_at_xy(sum(q[0::2]) / 4, sum(q[1::2]) / 4)
    cdp('Input.insertText', text='尚未保存')
    draft = js("document.querySelector('#nameInput').value")
    escape()
    check("bossMode && !document.querySelector('dialog[open]')", 'Esc from a focused nickname input hides its native dialog')
    escape()
    check("document.querySelector('#nameModal').open && document.activeElement.id==='nameInput'", 'return restores nickname dialog and input focus')
    assert js("document.querySelector('#nameInput').value") == draft
    print('PASS: unsaved nickname remains intact')
    click('×')

    check("!document.querySelector('#demo') && document.querySelectorAll('button[data-species]').length===0", 'there is no solo mode or fish selector')
    for i in range(20):
        click('摸一下鱼，贡献一次摸鱼')
        for _ in range(50):
            if js('state.count') == i + 1: break
            time.sleep(.05)
        assert js('state.count') == i + 1
    with urllib.request.urlopen(URL.split('/?')[0] + '/api/state') as response:
        observer = json.load(response)
    assert observer['count'] == 20 and observer['mine'] == 0 and observer['canChoose'] is False
    print('PASS: a second player sees the same progress but has no winner privilege')
    check("state.count===20 && document.querySelector('#finish').open", 'test fish reaches its final-choice dialog')
    escape()
    check("bossMode && !document.querySelector('dialog[open]')", 'Esc hides the final-choice dialog')
    escape()
    check("!bossMode && document.querySelector('#finish').open", 'return restores an unfinished choice')
    escape()
    with app.connect() as db:
        db.execute('UPDATE rounds SET finished_at=? WHERE id=1', (time.time() - app.CHOICE_SECONDS - 2,))
    js("refresh();toast('此消息不能盖住工作页')")
    for _ in range(50):
        if js("state.dish==='放生'"):break
        time.sleep(.05)
    check("bossMode && !document.querySelector('dialog[open]') && !document.querySelector('#toast').classList.contains('show')", 'incoming settlement and toast cannot cover work view')
    escape()
    check("document.querySelector('#result').open && document.querySelector('#resultTitle').textContent.includes('重获自由')", 'return shows the settlement received while away')
    escape()
    with app.connect() as db:
        db.execute('INSERT INTO rounds(target) VALUES(?)', (20,))
    js('refresh()')
    for _ in range(50):
        if js('state.round===2'):break
        time.sleep(.05)
    escape()
    check("!document.querySelector('dialog[open]')", 'old settlement does not reopen after a new round')

    escape()
    count = js('state.count')
    press(' ', 'Space', 32)
    assert js('state.count') == count
    print('PASS: space in work view does not touch the fish')
    press('Tab', 'Tab', 9)
    check("document.activeElement.id==='backToPond'", 'Tab stays on the visible return control')
    press('Enter', 'Enter', 13)
    check('!bossMode', 'Enter activates the return control')

    cdp('Emulation.setDeviceMetricsOverride', width=390, height=844, deviceScaleFactor=1, mobile=True)
    escape()
    check("(()=>{const r=document.querySelector('#backToPond').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<innerHeight})()", 'return button is visible on a narrow screen')
    click('返回上一页 Esc')
    check('!bossMode', 'narrow-screen return button works')
    cdp('Network.enable')
    cdp('Network.emulateNetworkConditions', offline=True, latency=0, downloadThroughput=-1, uploadThroughput=-1)
    js('refresh()')
    for _ in range(50):
        if js('!connected'):break
        time.sleep(.05)
    check("!connected && document.querySelector('#fish').disabled && !document.querySelector('#connectionNotice').hidden", 'disconnection pauses play and shows a plain-language notice')
    assert js('state.count') == count
    cdp('Network.emulateNetworkConditions', offline=False, latency=0, downloadThroughput=-1, uploadThroughput=-1)
    js('refresh()')
    for _ in range(50):
        if js('connected'):break
        time.sleep(.05)
    check("connected && document.querySelector('#connectionNotice').hidden", 'reconnection restores shared play')
    check('__bossErrors.length===0', 'no runtime errors or rejected promises')
finally:
    cdp('Network.emulateNetworkConditions', offline=False, latency=0, downloadThroughput=-1, uploadThroughput=-1)
    cdp('Emulation.clearDeviceMetricsOverride')
    cdp('Emulation.setFocusEmulationEnabled', enabled=False)
    cdp('Target.closeTarget', targetId=owned)
    server.shutdown()
    server.server_close()
    thread.join()
    temporary.cleanup()
