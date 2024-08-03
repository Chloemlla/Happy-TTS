import unittest
from unittest.mock import patch, MagicMock
from app import app  # 假设 doing 函数位于 app.py 中

# 正确的密码，需要替换为实际的密码
correct_password = "correct_password"
current_processing_text = "current_processing_text"

class TestDoing(unittest.TestCase):

    def setUp(self):
        # 创建一个临时的 Flask 测试客户端
        self.client = app.test_client()

    @patch('app.request')
    def test_doing_with_correct_password(self, mock_request):
        # 设置模拟对象返回的值
        mock_request.args = {'password': correct_password}

        # 使用 Flask 的测试客户端创建一个请求上下文
        with app.test_request_context('/doing'):
            # 发送请求
            response = self.client.get('/doing')

            # 验证响应状态码
            self.assertEqual(response.status_code, 200)

            # 验证返回的数据是否按预期进行 Base64 编码
            data = json.loads(response.get_data(as_text=True))
            expected_data = {"text": current_processing_text}
            self.assertEqual(data, expected_data)

    @patch('app.request')
    def test_doing_with_incorrect_password(self, mock_request):
        # 设置模拟对象返回一个错误的密码值
        mock_request.args = {'password': 'incorrect_password'}

        # 使用 Flask 的测试客户端创建一个请求上下文
        with app.test_request_context('/doing'):
            # 发送请求
            response = self.client.get('/doing')

            # 验证响应状态码
            self.assertEqual(response.status_code, 200)

            # 验证返回的数据是随机生成的
            data = json.loads(response.get_data(as_text=True))
            self.assertTrue(isinstance(data, dict))
            self.assertIn('text', data)
            self.assertEqual(len(data['text']), 10)

if __name__ == '__main__':
    unittest.main()