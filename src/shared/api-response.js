export function ok(data) {
  return {
    data,
    error: null,
  };
}

export function fail(code, message) {
  return {
    data: null,
    error: {
      code,
      message,
    },
  };
}

export function sendOk(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    data,
    error: null,
  });
}

export function sendFail(res, code, message, statusCode = 400) {
  return res.status(statusCode).json({
    data: null,
    error: {
      code,
      message,
    },
  });
}
