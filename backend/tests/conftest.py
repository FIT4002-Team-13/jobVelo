from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def client():
    with (
        #Patch intercepts database functions and replaces them with async mock
        patch("database.connect_to_mongo", new_callable=AsyncMock),
        patch("database.ensure_indexes", new_callable=AsyncMock),
        patch("database.close_mongo_connection", new_callable=AsyncMock),
        TestClient(app) as c,
    ):
        yield c

