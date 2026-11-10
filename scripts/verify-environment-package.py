"""Package public source with generated config only; never read/copy operator config or datasets."""
import json
import hashlib
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]


def main():
    run = uuid.uuid4().hex
    image = 'agrosphere-anl02-web-check-' + run[:8]
    container = None
    record = {'status': 'NOT_RUN', 'scope': 'owned public-source packaging with generated config', 'runId': run}

    def docker(*args, check=True):
        result = subprocess.run(['docker', *args], capture_output=True, text=True, encoding='utf-8', errors='replace')
        if check and result.returncode:
            raise RuntimeError('Owned Web packaging Docker operation failed: ' + args[0])
        return result

    try:
        with tempfile.TemporaryDirectory(dir=ROOT / 'target', prefix='owned-anl02-web-package-') as temporary:
            context = Path(temporary).resolve()
            assert context.parent == (ROOT / 'target').resolve()
            shutil.copytree(ROOT / 'src', context / 'src')
            for name in ['package.json', 'package-lock.json', 'angular.json', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.spec.json', 'Dockerfile', 'nginx.conf']:
                shutil.copyfile(ROOT / name, context / name)
            (context / 'public').mkdir()
            for name in ['silent-check-sso.html', 'silent-check-sso.js']:
                shutil.copyfile(ROOT / 'public' / name, context / 'public' / name)
            config = {'apiBaseUrl': 'http://127.0.0.1:1', 'keycloak': {'url': 'http://localhost:1', 'realm': 'generated-only', 'clientId': 'agrosphere-web'}, 'cesium': {}}
            (context / 'public/config.json').write_text(json.dumps(config))
            record['sourceVersion'] = json.loads((context / 'package.json').read_text())['version']
            record['publicSourceHashes'] = {p.relative_to(context).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                                            for p in sorted(context.rglob('*')) if p.is_file()}
            built = docker('build', '-t', image, str(context), check=False)
            (ROOT / 'target/anl02-docker-build.log').write_text(built.stdout + built.stderr, encoding='utf-8')
            assert built.returncode == 0, 'Public-source Web packaging build failed; inspect generated build log'
            record['imageId'] = docker('image', 'inspect', '-f', '{{.Id}}', image).stdout.strip()
            container = docker('run', '-d', '--name', image, '--label', 'agrosphere.anl02.web.run=' + run, '-p', '127.0.0.1::8080', image).stdout.strip()
            port = docker('inspect', '-f', '{{(index (index .NetworkSettings.Ports "8080/tcp") 0).HostPort}}', container).stdout.strip()
            origin = 'http://127.0.0.1:' + port
            for _ in range(30):
                try:
                    with urllib.request.urlopen(origin + '/healthz', timeout=2) as response:
                        if response.status == 200: break
                except Exception:
                    time.sleep(.5)
            else:
                raise AssertionError('Owned Web package did not become healthy')
            with urllib.request.urlopen(origin + '/production-history', timeout=5) as response:
                assert response.status == 200 and b'<agrosphere-root' in response.read()
            with urllib.request.urlopen(origin + '/config.json', timeout=5) as response:
                assert json.load(response) == config
            record.update(status='PASS', independentDockerBuild=True, nginxHealthy=True, spaRoute=True, onlyGeneratedRuntimeConfig=True)
    except Exception:
        record['status'] = 'FAILED'
        raise
    finally:
        if container:
            assert docker('inspect', '-f', '{{index .Config.Labels "agrosphere.anl02.web.run"}}', container).stdout.strip() == run
            docker('rm', '--force', '--volumes', container)
            assert docker('inspect', container, check=False).returncode != 0
            record['ownedContainerRemoved'] = True
        docker('image', 'rm', image, check=False)
        record['ownedImageTagAbsent'] = docker('image', 'inspect', image, check=False).returncode != 0
        (ROOT / 'target/anl02-docker-package.json').write_text(json.dumps(record, indent=2) + '\n')


if __name__ == '__main__':
    main()
