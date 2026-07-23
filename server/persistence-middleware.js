const clone = (value) => JSON.parse(JSON.stringify(value));
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function createPersistenceMiddleware({ db, replaceState, persistence }) {
  let mutationTail = Promise.resolve();

  return function persistenceMiddleware(req, res, next) {
    if (!MUTATING_METHODS.has(req.method) || !persistence.isCloudEnabled()) return next();

    let release;
    const previous = mutationTail;
    mutationTail = new Promise((resolve) => { release = resolve; });

    previous.then(() => {
      const before = clone(db);
      const originalJson = res.json.bind(res);
      let persistenceStarted = false;
      let released = false;
      const releaseOnce = () => {
        if (released) return;
        released = true;
        release();
      };
      res.once("finish", releaseOnce);
      res.once("close", releaseOnce);

      res.json = function persistBeforeJson(body) {
        if (persistenceStarted) return originalJson(body);
        if (res.statusCode >= 400) {
          replaceState(before);
          return originalJson(body);
        }
        persistenceStarted = true;
        persistence.persist(db).then(() => {
          originalJson(body);
        }).catch((error) => {
          replaceState(before);
          res.status(503);
          originalJson({
            error: "PERSISTENCE_FAILED",
            message: "데이터를 영구 저장하지 못해 변경을 취소했습니다.",
            detail: error.message || String(error),
            saved: false,
          });
        });
        return res;
      };

      next();
    }).catch(next);
  };
}

module.exports = { createPersistenceMiddleware };
