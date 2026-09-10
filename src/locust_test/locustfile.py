from locust import HttpUser, task


class Teste(HttpUser):
    @task
    def test_questionario(self):
        self.client.get("/questionario/teste")
