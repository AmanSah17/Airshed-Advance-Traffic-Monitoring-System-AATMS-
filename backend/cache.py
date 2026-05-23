import redis
import json
import logging
import threading
from typing import Optional, Any

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CacheBackend:
    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.use_redis = False
        self._lock = threading.Lock()
        self._local_cache = {}
        
        try:
            # Short timeout to avoid blocking startup if Redis isn't running
            self.client = redis.Redis.from_url(redis_url, socket_connect_timeout=2, socket_timeout=2)
            self.client.ping()
            self.use_redis = True
            logger.info("Successfully connected to Redis cache on port 6379.")
        except Exception as e:
            logger.warning(f"Redis connection failed: {e}. Falling back to In-Memory local cache.")

    def get(self, key: str) -> Optional[Any]:
        if self.use_redis:
            try:
                val = self.client.get(key)
                if val:
                    return json.loads(val.decode('utf-8'))
            except Exception as e:
                logger.error(f"Redis GET error: {e}")
            return None
        else:
            with self._lock:
                return self._local_cache.get(key)

    def set(self, key: str, value: Any, expire: int = 60) -> None:
        if self.use_redis:
            try:
                self.client.setex(key, expire, json.dumps(value))
            except Exception as e:
                logger.error(f"Redis SET error: {e}")
        else:
            with self._lock:
                self._local_cache[key] = value

    def delete(self, key: str) -> None:
        if self.use_redis:
            try:
                self.client.delete(key)
            except Exception as e:
                logger.error(f"Redis DELETE error: {e}")
        else:
            with self._lock:
                if key in self._local_cache:
                    del self._local_cache[key]

cache = CacheBackend()
