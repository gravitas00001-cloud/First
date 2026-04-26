release: python FakeKilo/manage.py collectstatic --noinput && python FakeKilo/manage.py migrate
web: gunicorn --chdir FakeKilo FakeKilo.wsgi:application --bind 0.0.0.0:${PORT:-8000} --log-file -
