import http from 'node:http';

const PORT = Number(process.env.MOCK_API_PORT || '4002');
const PILL_DETAIL_PREFIX = '/api/v1/search/pills/';

const MOCK_PILLS = new Map([
  [
    '199303108',
    {
      id: 1,
      itemSeq: '199303108',
      itemName: '타이레놀정500밀리그람(아세트아미노펜)',
      entpName: '(주)한국얀센',
      chart: '흰색의 장방형 필름코팅정제',
      drugShape: '장방형',
      colorClass1: '하양',
      colorClass2: null,
      lineFront: null,
      lineBack: null,
      itemImage: null,
      updatedAt: '2026-11-24T00:00:00Z',
    },
  ],
]);

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(payload));
}

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url || '/', `http://localhost:${PORT}`);
  const { pathname } = reqUrl;

  if (pathname === '/health') {
    writeJson(res, 200, { success: true, message: 'Mock SSR API running' });
    return;
  }

  if (pathname === '/api/v1/search/sitemap') {
    writeJson(res, 200, {
      success: true,
      pills: Array.from(MOCK_PILLS.keys()).map((itemSeq) => ({ itemSeq })),
    });
    return;
  }

  if (pathname.startsWith(PILL_DETAIL_PREFIX)) {
    const itemSeq = decodeURIComponent(pathname.slice(PILL_DETAIL_PREFIX.length));
    const pill = MOCK_PILLS.get(itemSeq);
    if (!pill) {
      writeJson(res, 404, { success: false, message: '요청하신 의약품 정보를 찾을 수 없습니다.' });
      return;
    }
    writeJson(res, 200, { success: true, pill });
    return;
  }

  writeJson(res, 404, { success: false, message: 'Not mocked' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mockSsrApiServer] listening on http://127.0.0.1:${PORT}`);
});
